# Phone (OTP) Authentication + Notification Pipeline

> **Status:** Approved design — not yet implemented.
> **Date:** 2026-06-12 · **Branch context:** `dfactories/2.1.2` (private fork)
> **Scope:** `@mercurjs/core` (backend), `@mercurjs/admin` (settings UI), `@mercurjs/vendor` (login/register UI), external storefront (backend endpoints only).

This is the design/decision record (ADR-style) for adding **passwordless phone (OTP) registration & login** alongside the existing email flow, integrating the **sms.ir** SMS service, and giving marketplace operators an **admin page to choose the delivery channel (email / SMS) per notification event**.

It exists so that, after implementation, anyone can reconstruct *what was built and why*, and extend it (new events, new channels, new providers) without guessing.

---

## 1. Context & Problem

- Authentication today is pure Medusa `emailpass` (`/auth/{actor}/{provider}/register`). The vendor panel uses `$actorType: "member"` + `emailpass` ([packages/vendor/src/hooks/api/auth.tsx](../../packages/vendor/src/hooks/api/auth.tsx)).
- There is **no centralized notification fabric** in core. The only `createNotifications` call is the seller-invitation email ([packages/core/src/workflows/seller/steps/send-invitation-email.ts](../../packages/core/src/workflows/seller/steps/send-invitation-email.ts)).
- The target market (Iran) expects **phone-number + OTP** as the primary sign-in. We must add it without removing email, and route operational notifications over SMS via **sms.ir**.

Because no notification routing layer exists, "let the admin pick email vs SMS per event" requires building a small **notification platform** (event catalog + per-event config + a send pipeline), not just a settings screen.

---

## 2. Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Passwordless OTP** via sms.ir `POST /v1/send/verify` (we generate the code; sms.ir delivers it through a pre-approved template, code passed as a parameter). | Iran-standard UX; sms.ir has a dedicated high-priority verify endpoint. No password to store/leak. |
| 2 | Phone login enabled for **storefront (customer) + vendor**. **Admin login stays email-only.** Admin still owns the notification-settings page. | Operators are internal/trusted; phone-login for admin adds security surface with little benefit. |
| 3 | **Phone is the primary, unique identity; email is an optional secondary** profile field. | Matches the market; keeps a single account per person keyed by phone. |
| 4 | Channel selection is **global per-event** (operator-set). No per-user preference. | Simplest correct model for v1; per-user prefs can be layered on later via the policy stage. |
| 5 | Ship **OTP + all transactional events**. SMS for any event is **gated on a `template_id` existing in the DB** for that event. | sms.ir requires an approved template per message type; only the OTP template is approved today. Gating lets the page expose every event while SMS turns on per-event as templates get approved — no deploy. |
| 6 | **Only the API key lives in env** (`SMSIR_API_KEY`). All template IDs / params / channel state live in the **DB**, editable from admin. | Templates change at runtime as sms.ir approves them; env would force redeploys and hide config from operators. |
| 7 | **OTP is fully separated** from the notification pipeline and settings. Subscribers never call the notification module directly — they emit a typed `NotificationIntent` consumed by one workflow. The catalog is a **hybrid**: static defs in code + boot-time registry + mutable DB state. Transactional dispatch sits **on top of `Modules.NOTIFICATION`**. | OTP is auth-critical and must never be disabled by a notification toggle. Decoupling + workflow gives retry/idempotency/observability. Hybrid catalog keeps contracts in code while letting operators (and future blocks) extend at runtime. |

---

## 3. Architecture

```
domain events ─► orchestrator subscriber
                   │  builds: NotificationIntent { event_key, payload, occurred_at, dedupe_key }
                   ▼
        sendNotificationWorkflow(intent)              ← Medusa workflow (retry / idempotent / observable)
        ├─ 1 resolveRecipients : catalog.resolve(payload) → recipients[] {email?, phone?, data}   (fan-out: N recipients)
        ├─ 2 applyPolicy       : DB(event×channel) + capability(has phone?/email?) + template-gate → allowed channels per recipient
        ├─ 3 buildTemplate     : email → {subject, html}   |   sms → {templateId, params[]}   (+ fa / RTL)
        ├─ 4 routeChannels     : channel → Medusa notification channel id
        └─ 5 dispatch          : notificationModule.createNotifications({channel, …})  ──► email / sms / feed providers

OTP path (completely separate):
        auth/otp module ─► smsirClient.sendVerify(mobile, otpTemplateId, [{ name: "CODE", value }])   // gated by NOTHING in settings
```

### Principles
- **resolver returns an array** of recipients → the pipeline fans out (e.g. "order placed" → the customer + each seller).
- **`intent.dedupe_key`** (= source event id) makes retries / duplicate events idempotent.
- **policy is a thin pure function** `(settings, recipient, channel) → allow | deny(reason)`. Quiet-hours, rate-limits and per-user prefs are intentionally out of scope for v1 but this is where they'd attach.
- **template stage is asymmetric:** email is rendered locally (subject + HTML, like the existing invitation builder); SMS is **not rendered** — it is a `templateId` + an ordered `params[]` array sent to sms.ir.
- **dispatch is thin:** it only calls `createNotifications`; Medusa's Notification module does channel→provider routing and gives the in-app `feed` channel for free (already used by Mercur).

### Code placement
All new modules/providers live **inside `@mercurjs/core`** as subpath exports (mirroring `@mercurjs/core/modules/admin-ui`) and are **auto-registered by `withMercur`** (the same place it injects the `rbac` module — [packages/core/src/with-mercur.ts](../../packages/core/src/with-mercur.ts)). This keeps the fork's single-package publish pipeline (Verdaccio / dfactories) unchanged — no new published packages.

---

## 4. Data Contracts & Models

### `NotificationIntent` (in-memory, subscriber → workflow)
```ts
type NotificationIntent = {
  event_key: string          // e.g. "order.placed"
  payload: Record<string, unknown>
  occurred_at: string        // ISO
  dedupe_key: string         // = source event id, for idempotency
}
```

### `NotificationChannelConfig` (DB — module `notification-settings`)
One row **per (event_key, channel)**:
```
event_key   string   // FK-ish to the catalog key
channel     enum     // "email" | "sms" | "feed" | ...
enabled     boolean
template_id string?  // sms.ir approved template id (SMS) / email template ref
params_map  json?    // event payload → ordered sms.ir params
subject     string?  // email subject override
```
Seeded from the catalog: `email` defaults on; `sms` stays **off until `template_id` is set**.

### Catalog entry (static, code — `notification/catalog.ts`)
Registered at boot via `registerNotificationEvent(def)`:
```ts
type NotificationEventDef = {
  key: string
  audience: "customer" | "vendor" | "admin"
  availableChannels: Channel[]
  payloadSchema: ZodSchema
  resolve(payload, container): Recipient[]      // {email?, phone?, data}
  emailTemplate?: EmailTemplateRef
  system?: boolean                              // e.g. OTP — shown read-only, not routed
}
```
**Effective catalog = static registry left-joined with the DB config** (defaults created on first read).

### `OtpCode` (DB — module `otp`, separate from notifications)
```
identifier   string   // phone (E.164)
actor_type   enum     // "customer" | "member"
code_hash    string
expires_at   datetime
consumed_at  datetime?
attempts     int
```
OTP template id / TTL / length are config of the **otp module** (DB-seeded), not part of the notification template map.

---

## 5. Component Map

**New**
- `packages/core/src/providers/smsir/client.ts` — shared transport (`sendVerify`, `send`), `X-API-KEY`.
- `packages/core/src/providers/notification-smsir/*` — Medusa notification provider, `channel="sms"`.
- `packages/core/src/api/utils/phone-otp.ts` + `api/{store,vendor}/auth/phone/{request-otp,verify-otp}/route.ts` — phone OTP request/verify as thin custom routes (no Medusa auth provider; see §12).
- `packages/core/src/modules/otp/*` — OTP code store + `requestOtp`/`verifyOtp`.
- `packages/core/src/modules/notification-settings/*` — `NotificationChannelConfig` model + service.
- `packages/core/src/notification/catalog.ts` — hybrid catalog + `registerNotificationEvent`.
- `packages/core/src/workflows/notification/send-notification.ts` — the 5-step pipeline workflow.
- `packages/core/src/subscribers/notification-orchestrator.ts` — binds `config.event = catalog.eventKeys()`, builds intents.
- `packages/core/src/api/{store,vendor}/auth/phone/*` — `request-otp` / `verify-otp` routes.
- `packages/core/src/api/admin/notification-settings/*` — GET/POST + validators.
- `packages/admin/src/pages/notification-settings/*` — operator UI.

**Edited**
- [packages/core/src/with-mercur.ts](../../packages/core/src/with-mercur.ts) — inject Auth (`emailpass` + `phone-otp`) & Notification (email + `notification-smsir`) modules; add `phone_auth` feature flag.
- [apps/api/medusa-config.ts](../../apps/api/medusa-config.ts) — env wiring.
- [packages/core/src/api/vendor/sellers/route.ts](../../packages/core/src/api/vendor/sellers/route.ts) + `validators.ts`, [upsert-member step](../../packages/core/src/workflows/seller/steps/upsert-member.ts) — accept `phone`, make `member_email` optional.
- [packages/vendor/src/hooks/api/auth.tsx](../../packages/vendor/src/hooks/api/auth.tsx), `pages/login`, `pages/register` — phone tab + `useRequestOtp`/`useVerifyOtp`.
- [packages/admin/src/get-route-map.tsx](../../packages/admin/src/get-route-map.tsx) — register the settings route/nav.
- `packages/types/*` — `NotificationChannelConfig`, `RequestOtp`, `VerifyOtp`, seller `phone`.

---

## 6. Request Flows

### Phone OTP login (vendor / customer)
```
UI → POST /vendor/auth/phone/request-otp { phone }
       → otp.requestOtp() → smsirClient.sendVerify(phone, otpTemplateId, [{CODE}])
UI → POST /vendor/auth/phone/verify-otp { phone, code }
       → verify-otp route: otp.verifyOtp() → find/create auth identity (provider "phone-otp", entity_id = phone) → generateJwtToken
       → returns { token } → UI sets sdk.auth.session
       → (first time) POST /vendor/sellers runs createSellerAccountWorkflow on the new auth_identity_id
```

### Transactional notification (e.g. order placed)
```
order.placed event → notification-orchestrator → NotificationIntent
  → sendNotificationWorkflow:
      resolveRecipients → [customer, sellerA, sellerB]
      applyPolicy       → per recipient: which of {email,sms} enabled + capable + template present
      buildTemplate     → email {subject,html} / sms {templateId, params}
      routeChannels + dispatch → Modules.NOTIFICATION → email / notification-smsir / feed
```

---

## 7. Extension Points (for the future)

**Add a new notifiable event**
1. `registerNotificationEvent({ key, audience, availableChannels, payloadSchema, resolve, emailTemplate })` (in core or a block, at boot).
2. Emit the domain event somewhere; the orchestrator auto-binds because it reads `catalog.eventKeys()`.
3. It appears in the admin page automatically (email default on; SMS off until a `template_id` is entered).

**Add a new channel (e.g. push / WhatsApp)**
1. Implement a Medusa notification provider for the new channel id.
2. Add the channel to the relevant catalog entries' `availableChannels` and to the policy/route stages.
3. The admin page renders a toggle for any channel a catalog entry declares.

**Swap / add an SMS provider**
- Replace `providers/notification-smsir` (and the OTP path's `smsirClient`) with another provider implementing the same surface. Only `smsir/client.ts` and the provider need to change; the pipeline and OTP module are provider-agnostic.

**Turn on SMS for an event after sms.ir approves a template**
- In **Admin → Notification settings**, paste the approved `template_id` for that event's SMS row and enable it. No deploy. (The same gate is why SMS rows are disabled until a `template_id` exists.)

---

## 8. Phased Rollout

`A` Documentation & tracking (this doc + `feature_list.json` + progress/handoff). → **Phase 0** env/flags/`withMercur` wiring → **1** sms.ir transport + notification provider → **2** OTP module + auth provider (separate path) → **3** identity (phone primary) → **4** catalog + settings module + pipeline + orchestrator → **5** admin settings page → **6** vendor phone UI → **7** storefront backend endpoints → **8** types/client/i18n/**tests**/build → **9** migrations, seed, publish.

Each phase tracked in [`feature_list.json`](../../feature_list.json); progress in [`claude-progress.md`](../../claude-progress.md).

---

## 9. Verification

- `bun run lint && bun run build` green.
- `bun run test:integration:tests` — OTP request/verify (vendor+store, sms.ir client mocked), account creation by phone, phone uniqueness, email path intact; `admin/notification-settings` CRUD + SMS gating without `template_id`; pipeline unit per stage + integration (email-only, sms-only, no-phone fallback, duplicate `dedupe_key` → no resend); **OTP isolation** (toggling settings does not affect OTP send).
- Manual (real OTP template): vendor phone sign-in end-to-end; toggle an event to SMS with a `template_id` and confirm routing in feed/logs; confirm disabling it does not break OTP.

---

## 10. Risks & Dependencies

- sms.ir approved templates exist **only for OTP** today → transactional SMS is gated per-event on a DB `template_id` (surfaced clearly in the UI).
- Phone **uniqueness / migration** for any pre-existing email-only accounts.
- Medusa (pinned framework `2.13.4`) auth-provider contract must support the **two-step OTP** within `authenticate` — validate empirically in Phase 2.
- **RBAC** protection on `admin/notification-settings`.

## 11. Reference

- sms.ir Web Service: base `https://api.sms.ir/v1`, header `X-API-KEY`. OTP via `POST /send/verify` with `{ mobile, templateId, parameters: [{ name, value }] }`. Standard send endpoint for general SMS. Docs: https://sms.ir/web-service/

---

## 12. Implementation refinements (discovered during build)

These deviations from the original plan were made for robustness and recorded here so the design stays truthful.

### 12.1 No Medusa auth provider — phone OTP is handled by thin custom routes
The plan named a `providers/auth-phone-otp` Medusa auth provider. During implementation this was dropped in favour of custom routes, because:
- A Medusa auth provider runs inside the **Auth module's isolated container** and cannot reliably resolve the **OTP module's** service (cross-module access). Verifying the code inside the provider would therefore be fragile.
- Medusa's generic `/auth/:actor/:provider` route returns a token only on `success && authIdentity`, so the **"request code" step can't return a clean 200** through it anyway — custom routes were already required for that half.

Implementation instead:
- `packages/core/src/api/utils/phone-otp.ts` — shared `createRequestOtpHandler(actorType)` / `createVerifyOtpHandler(actorType)`.
- `request-otp`: `otpService.requestOtp()` → `smsirClient.sendVerify(phone, SMSIR_OTP_TEMPLATE_ID, [{name:"CODE", value:code}])`. Always 200.
- `verify-otp`: `otpService.verifyOtp()` → find-or-create the auth identity via the **Auth module CRUD** (`listProviderIdentities` / `createAuthIdentities`, provider label `"phone-otp"`, `entity_id = phone`) → mint the session token with the public `generateJwtToken` (mirroring Medusa's internal `generateJwtTokenForAuthIdentity`, including RBAC roles when the actor already exists). Returns `{ token }`, which the frontend hands to `sdk.auth.session` exactly like the emailpass flow.
- The emailpass flow and the standard `/auth/*` routes are completely untouched. `"phone-otp"` is only a provider-identity label.

Net effect: **no `withMercur` Auth-module injection is needed**, removing that risk entirely. (The Notification-module injection from Phase 1 is still in place and unaffected.)

### 12.2 OTP template id source
`SMSIR_OTP_TEMPLATE_ID` (and `SMSIR_OTP_PARAM_NAME`, default `CODE`) are read from env as the OTP module's effective config for now. This is consistent with "OTP template lives in the OTP/auth config, not the notification template map" (§2.6) — it is intentionally NOT part of the per-event notification template table. It can later be promoted to a DB-seeded OTP config row without changing callers.

### 12.3 Phase 3 identity scope (member/seller)
- **Member** (`modules/seller/models/member.ts`): added a nullable `phone` (unique where not null) and made `email` nullable (unique where not null). `MemberDTO`/`CreateMemberDTO`/`UpdateMemberDTO` updated; `upsertMembers` now keys on email **or** phone.
- **Registration** (`POST /vendor/sellers`): `member_email` is now optional, `member_phone` added; the route requires at least one. `createSellerAccountWorkflow` carries `member_phone` through to `upsertMembers`. `member_phone` is frontend-supplied (same trust model as `member_email`; the member is still linked to the caller's verified `auth_identity_id`).
- **Seller `email` kept required** (store contact). A phone-registering vendor still provides a store contact email; making `seller.email` optional has a wide blast radius (`SellerDTO.email`, admin/store views, seller-email notifications) and is a deferred follow-up, not required for phone login/registration.
- **Customer (store) entity** create-with-phone is deferred to Phase 7: Medusa's core customer requires a unique `email`, so a phone-only customer needs a custom `/store/customers` route. Phone **auth** for customers already works (store `verify-otp` issues a customer token).
- **Migrations** for the new `otp` table and the member `phone` column/indexes are generated/run together in Phase 9.
