# Claude Progress -- Mercur.js

## Current Verified State

- **Repository root**: `/Users/viktorholik/Desktop/mercur`
- **Current branch**: `canary` (up to date with `origin/canary`)
- **Current version**: `2.1.2-canary.5`
- **Standard startup path**: `bun install && bun run dev`
- **Standard verification path**: `bun run build`, `bun run lint` (oxlint), `bun run test:integration:http -- <pattern>`
- **Highest priority unfinished work**: finalize the lint/tooling refactor (oxlint migration, template-sync removal, meilisearch test removal) currently staged in the working tree, then verify and commit.
- **Current blocker**: none -- working tree has uncommitted refactor (see Session 2 below) that has not yet been verified end-to-end.

## Session Log

### Session 1: 2026-05-11 -- i18n coverage and onboarding extensibility (#919)

**Goal**: Close i18n gaps in admin + vendor, and make seller onboarding extensible.

#### Completed

- Expanded vendor `pl.json` (+425 lines) and `en.json` translation catalogs; updated translation `$schema.json`.
- Added i18n for order fulfillment, payment, summary sections, payouts, and product create/edit flows in `packages/vendor`.
- Made onboarding wizard extensible via `useOnboarding` hook and new dashboard-sdk types/plugin hook.
- Tightened admin + vendor seller validators (`packages/core/src/api/admin/sellers/validators.ts`, `packages/core/src/api/vendor/sellers/validators.ts`).
- Adjusted shared dashboard components: `country-select`, `data-grid-toggleable-number-cell`, payout columns/filters.
- Bumped dashboard-sdk, dashboard-shared, payout-stripe-connect, types, vendor packages.
- 69 files changed, +1673 / -277.

#### Verification

- Merged via PR #919 onto `canary` (commit `a15dc78f`).

### Session 2: 2026-05-12 -- canary patch fixes (canary.1 -> canary.5)

**Goal**: Ship a series of small fixes on top of the i18n PR for the canary.2 -> canary.5 releases.

#### Completed

- `b77c9ce9` fix(vendor): improve PL translations for order statuses and columns.
- `e886d5bd` fix(vendor): correct thumbnail size in order summary.
- `89370c1f` fix(admin): improve PL translations for order statuses and columns.
- `c4912156` fix(vendor): translate commission label in order summary.
- `3c4e9ac5` fix(dashboard-sdk): dedupe `i18next` and `react` in vite `resolve` to fix duplicate-instance hook errors.
- Cut version bumps: `2.1.2-canary.1` -> `2.1.2-canary.5` (chore commits `bfac174c`, `b93fa95c`, `706321fc`, `a005f1c2`, `19779278`).

#### Verification

- Each fix shipped as its own commit on `canary`. No regression report from downstream consumers as of 2026-05-15.

#### Known risks

- The dashboard-sdk dedupe fix changes Vite resolve config -- consumers with custom `vite.config` may need to merge the new resolve aliases when upgrading.

### Session 3: 2026-05-15 (in progress) -- Tooling + repo cleanup

**Goal**: Replace ESLint with oxlint, drop unused tooling/docs/tests, and rewrite CLAUDE.md as a quick-reference doc.

#### Completed (uncommitted)

- Root `package.json`: replaced `eslint` script with `oxlint`; replaced `turbo run test:integration:http` wrapper with a direct call into `integration-tests`; added `oxlint ^1.64.0`; dropped `format` and `check-types` root scripts.
- Added `.oxlintrc.json` at repo root with `typescript`, `react`, `import`, `jsx-a11y` plugins and `correctness=error / suspicious=warn / perf=warn` categories. Disabled `react/react-in-jsx-scope` (obsolete under React 17+ automatic JSX runtime).
- Switched `packages/admin/package.json` and `apps/admin-test/package.json` `lint` scripts from `eslint` to `oxlint`.
- `turbo.json`: `build` outputs now `dist/**` and `.medusa/**` (was `.next/**`); `dev` now depends on `^build`.
- Deleted unused docs: `docs/seller.md`, `docs/seller-members.md`, `docs/subscriptions.md`.
- Deleted unused tooling: `tools/template-sync/check.ts`, `tools/template-sync/config.ts`.
- Removed dead integration tests + middleware: `integration-tests/src/api/admin/meilisearch/route.ts`, `integration-tests/src/api/store/meilisearch/products/search/route.ts`, `integration-tests/src/api/middlewares.ts`; removed `test:integration:meilisearch` script from `integration-tests/package.json`.
- Deleted `AGENTS.md`.
- Rewrote `CLAUDE.md` (~284 -> ~101 lines) as a quick-reference for Claude Code with build/run commands, project structure, working rules, and the standard startup/verification path.
- Added new docs: `docs/ARCHITECTURE.md` (system + layer diagram of the Mercur plugin on top of Medusa), `docs/PRODUCT.md` (product description + audiences + feature list), `packages/core/ARCHITECTURE.md` (core plugin internals).
- `bun.lock` updated to reflect oxlint addition and eslint drop.

#### Verification run

- `bunx oxlint --quiet` (2026-05-15): **0 errors, 1190 warnings** across 4390 files (152 rules, 961ms).
- Still outstanding before this session can be considered done:
  - `bun install` after the lockfile change.
  - `bun run build` across all packages -- confirm the `turbo.json` output path change does not break caching.
  - `bun run test:integration:http -- <pattern>` on at least one suite to confirm the meilisearch test removal did not leave dangling references.
  - Triage the 1190 warnings (`suspicious` + `perf` + style) -- decide which to fix vs. silence in `.oxlintrc.json`.

#### Evidence recorded

- `git status` shows: 17 modified/deleted files + 4 new files (`.oxlintrc.json`, `docs/ARCHITECTURE.md`, `docs/PRODUCT.md`, `packages/core/ARCHITECTURE.md`).
- `git diff --stat HEAD`: 19 files changed, +138 / -1040.

#### Known risks

- **Lint coverage gap**: oxlint does not implement every ESLint rule. Some violations previously caught (e.g. custom plugin rules) may silently pass now. Spot-check the diff against prior `eslint --max-warnings 0` baseline.
- **Turbo cache invalidation**: changing `build.outputs` from `.next/**` to `dist/**, .medusa/**` will invalidate every package's build cache on first run after merge -- expect a slow first CI build.
- **`dev` now depends on `^build`**: this means `bun run dev` will block on upstream builds. Acceptable for the dashboard-sdk dedupe fix to work, but watch DX impact.
- **Removed docs are not yet replaced**: the seller/seller-members/subscriptions pages were deleted but no replacement entry was added to the docs index -- confirm `apps/docs` navigation no longer references them before publishing.

#### Next best action

1. `bun install` to refresh the lockfile cleanly.
2. Triage the 1190 oxlint warnings -- decide bulk-fix (`bunx oxlint --fix`) vs. silencing categories in `.oxlintrc.json`.
3. `bun run build` end-to-end.
4. Run one integration-test suite (e.g. `bun run test:integration:http -- product`) to confirm Jest config still resolves after the meilisearch deletions.
5. Verify `apps/docs/docs.json` does not reference the three deleted markdown files.
6. Once green, commit as one logical change set (suggested: `chore(repo): migrate from eslint to oxlint and drop unused tooling`) plus a separate docs commit for the new ARCHITECTURE/PRODUCT pages.

### Session 4: 2026-05-15 -- drop fulfillment global unique indexes (feature_list#drop-medusa-global-unique-constraints)

**Goal**: Ship the migration script that removes the three Medusa fulfillment indexes blocking multi-vendor seller onboarding.

#### Completed

- New script `packages/core/src/migration-scripts/drop-fulfillment-global-unique-indexes.ts`. Single transaction, three `DROP INDEX IF EXISTS` statements against the PG_CONNECTION knex instance. Targets: `IDX_fulfillment_set_name_unique`, `IDX_shipping_profile_name_unique`, `IDX_service_zone_name_unique`.
- Auto-discovery confirmed: Medusa's `db:migrate:scripts` (medusa/packages/medusa/src/commands/db/run-scripts.ts:52-55) walks `join(plugin.resolve, "migration-scripts")` for every loaded plugin. A plugin's `resolve` is `<pkg>/.medusa/server/src/` (medusa/packages/core/utils/src/common/get-resolved-plugins.ts:86). Run state is tracked in `script_migrations` so each script runs at most once per project; idempotency is still defended at the SQL level via `IF EXISTS`.
- New integration test `integration-tests/http/migrations/drop-fulfillment-global-unique-indexes.spec.ts` covering: index removal, idempotent re-run, two sellers creating same-named shipping profile, two sellers creating same-named fulfillment set + service zone. The test does **not** import the script directly — it instantiates `MigrationScriptsMigrator` from `@medusajs/framework/migrations` and points it at `require.resolve("@mercurjs/core/package.json") → .medusa/server/src/migration-scripts/`, which is the same discovery path Medusa uses in `db:migrate:scripts`. This proves the script is wired in via plugin auto-attach, not via test-only glue.
- Built `packages/core` via `tsc --declaration --outDir .medusa/server`; compiled output at `packages/core/.medusa/server/src/migration-scripts/drop-fulfillment-global-unique-indexes.js` is what Medusa will execute.

#### Known pre-existing build noise

- `packages/core/src/workflows/cart/steps/prepare-adjustments-from-promotion-actions.ts:126` -- `string | undefined` vs `string` mismatch. Unrelated to this feature. Pre-existing on `canary`; do not address in this change set.

#### Verification still owed before commit

- `bun run test:integration:http -- migrations/drop-fulfillment-global-unique-indexes` (needs Postgres + Redis running). Spec asserts: indexes gone, idempotent, two sellers create same-named resources successfully.
- Decide whether to also commit the Session 3 oxlint refactor in the same PR or split.

#### Evidence

- See `feature_list.json` → `drop-medusa-global-unique-constraints.evidence`.

### Session 5: 2026-06-12 -- DESIGN ONLY -- phone (OTP) auth + notification pipeline

> Context note: this and following sessions run on the **private fork** at
> `/Users/aminkhademian/Desktop/AI projects/mercur-fork`, branch `dfactories/2.1.2`
> (publishes to registry.dfactories.ir). Earlier sessions logged the upstream
> `viktorholik/canary` checkout. No code from this feature is written yet.

**Goal**: Agree and durably record the design for phone-number OTP registration/login
(alongside email) using sms.ir, plus an admin page to pick email vs SMS per notification event.

#### Completed (this session)

- Locked 7 decisions with the user (5 product Q&A + 2 architecture rounds). Summary:
  passwordless OTP via sms.ir `/send/verify`; phone login for storefront+vendor only (admin stays email);
  phone = primary/unique identity, email optional; channel choice is global per-event;
  ship OTP + all transactional SMS but gate each event's SMS on a DB `template_id`;
  only `SMSIR_API_KEY` in env; OTP fully separated from the notification pipeline;
  hybrid event catalog (static + boot registry + DB); transactional dispatch on top of `Modules.NOTIFICATION`;
  one orchestrator subscriber → `NotificationIntent` → 5-step `sendNotificationWorkflow` (no subscriber calls notification directly).
- Verified the relevant codebase facts: auth is pure `emailpass`; the only `createNotifications` is the seller
  invitation step; `withMercur` injects modules (e.g. `rbac`); seller account creation runs on `auth_identity_id`.
- Wrote the design record: **`docs/features/phone-auth-and-notifications.md`** (ADR-style: context, decisions,
  architecture, contracts, component map, flows, extension points, phases, risks, verification).
- Registered 4 tracked features in `feature_list.json` (`status: not_started`):
  `smsir-transport` (p2), `phone-otp-auth` (p3), `notification-pipeline` (p4), `admin-notification-settings` (p5).
- Compact handoff added to `session-handoff.md`.

#### Verification

- Documentation phase only — no build/test run. Full plan saved at
  `~/.claude/plans/iridescent-gliding-spindle.md`.

#### Next best action

1. Begin **Phase 0** (see design doc §8 / feature `smsir-transport`): env wiring + `phone_auth` feature flag +
   make `withMercur` register the Auth (`emailpass` + `phone-otp`) and Notification (email + `notification-smsir`) modules.
2. Implement features in priority order 2→3→4→5; each must ship with integration tests (sms.ir client mocked)
   and keep `bun run build` + `bun run lint` green per Definition of Done.

### Session 6: 2026-06-12 -- IMPLEMENTATION -- Phase 1 (sms.ir transport + SMS provider) + OTP module

**Goal**: Begin implementing the approved design — start with the lowest-risk, self-contained layers.

#### Completed (uncommitted)

- **Phase 1 — sms.ir transport + SMS notification provider** (feature `smsir-transport` → `in_progress`):
  - `packages/core/src/providers/smsir/client.ts` — sole HTTP transport to sms.ir. `sendVerify(mobile, templateId, params)` (`POST /send/verify`, `X-API-KEY`); no-op + log when `SMSIR_API_KEY` unset (dev/test safe). Shared by both the OTP path and the notification provider.
  - `packages/core/src/providers/notification-smsir/{service,index}.ts` — `AbstractNotificationProviderService`, `channel: "sms"`, `ModuleProvider(Modules.NOTIFICATION)`. Reads `data.template_id` + `data.parameters` and forwards to the client (intentionally "dumb"; the pipeline decides routing).
  - `packages/core/src/with-mercur.ts` — injects `@medusajs/medusa/notification` (local for email/feed/seller_feed/vendor_feed + smsir for sms) **only if** the consumer hasn't declared their own; added `phone_auth` feature-flag default.
- **Phase 2 groundwork — OTP module** (feature `phone-otp-auth`):
  - `packages/types/src/modules.ts` — added `MercurModules.OTP` + `NOTIFICATION_SETTINGS`; `@mercurjs/types` rebuilt.
  - `packages/core/src/modules/otp/{models/otp-code,service,index}.ts` — `OtpCode` model (hashed, TTL, attempts) + service `requestOtp`/`verifyOtp` (HMAC, expiry, max-attempts, resend cooldown, timing-safe compare). `requestOtp` returns the plaintext to its caller so SMS delivery stays in the auth layer, not the module.
- **Phase 2 — phone OTP auth routes** (feature `phone-otp-auth` → `in_progress`; **no Medusa auth provider** — design §12):
  - `packages/core/src/api/utils/phone-otp.ts` (shared `createRequestOtpHandler`/`createVerifyOtpHandler`) + `api/{vendor,store}/auth/phone/{request-otp,verify-otp}/route.ts`. `request-otp` → `requestOtp` + `smsir.sendVerify(SMSIR_OTP_TEMPLATE_ID)`; `verify-otp` → `verifyOtp` + find/create auth identity (Auth-module CRUD, provider label `phone-otp`, `entity_id=phone`) + public `generateJwtToken` → `{ token }`. Vendor routes added to `api/vendor/middlewares.ts` `unauthenticatedRoutes`; store is public by default.
  - **Refinement** (`docs/features/phone-auth-and-notifications.md` §12): dropped the planned `providers/auth-phone-otp` + `withMercur` Auth-module injection — an auth provider can't reliably resolve the OTP module (module isolation) and the request-step can't return a clean 200 through the generic auth route. emailpass untouched. This retired the main Phase-2 risk.
- **Phase 3 — phone-primary identity (member/seller side)** (still feature `phone-otp-auth`):
  - `modules/seller/models/member.ts`: nullable `phone` (unique where not null) + `email` made nullable (unique where not null). `@mercurjs/types` `MemberDTO`/`CreateMemberDTO`/`UpdateMemberDTO` updated.
  - `SellerModuleService.upsertMembers`: rewritten to key on email **or** phone (find-or-create by either).
  - `POST /vendor/sellers`: `member_email` optional + `member_phone` added; route requires at least one; `createSellerAccountWorkflow` + `upsertMembersStep` carry `member_phone`.
  - Scoping (design §12.3): `seller.email` kept required (store contact); customer create-with-phone deferred to Phase 7 (Medusa customer requires email); migrations deferred to Phase 9. Core `tsc --noEmit` = 0 errors.
- **Phase 4 — notification platform** (feature `notification-pipeline` → `in_progress`; 5 sub-parts, 2 commits):
  - 4.1 types: `@mercurjs/types` notification types (NotificationChannel/Audience, NotificationRecipient, NotificationIntent, NotificationChannelConfigDTO, NotificationEventConfigDTO).
  - 4.2 catalog (`notification/catalog.ts`): hybrid registry + `registerNotificationEvent` + lazy default seeding (order.placed, seller.approved/suspended with `query.graph` resolvers; read-only `auth.otp` system row). `notificationEventKeys()` = routable keys.
  - 4.3 `modules/notification-settings`: `NotificationChannelConfig` (event×channel) + service (`getEffectiveCatalog` merge, `getDeliveryConfig` policy input, `upsertChannelConfigs`).
  - 4.4 `workflows/notification/send-notification.ts`: 4 steps — resolve (fan-out) / plan (capability + template gating) / build (email render, sms param-map) / dispatch via `Modules.NOTIFICATION` with `idempotency_key`.
  - 4.5 `subscribers/notification-orchestrator.ts`: one subscriber bound to `config.event = notificationEventKeys()` → `NotificationIntent` → workflow. No subscriber calls `createNotifications` directly.
  - Commits: foundation `b6943c5` (4.1-4.3); pipeline (4.4-4.5) this session. Core `tsc --noEmit` = 0 errors.

#### Verification

- `@mercurjs/types`: `tsc` build clean.
- `packages/core`: `tsc --noEmit` = **0 errors** (whole package).
- Resolve paths confirmed at runtime: `@medusajs/medusa/notification`, `@medusajs/medusa/notification-local`, `@medusajs/medusa/auth`, `@medusajs/medusa/auth-emailpass`.
- Not yet run: full medusa boot + integration tests (need Postgres/Redis; planned Phase 8). No DB migrations generated yet for the `otp` module.

#### Next best action

Backend of the whole feature is done (Phases 1-4 + 5a, type-clean, 7 commits). Remaining is frontend + tooling/DB:

1. **Make it runnable / verifiable** (recommended before the UIs, which depend on it): run `mercurjs codegen` (so `@mercurjs/client` types include `/admin/notification-settings` + `/vendor|store/auth/phone/*`), generate migrations (`otp`, member `phone`, `notification_channel_config`), and one real `bun run build` + a smoke boot. This unblocks typed dashboard pages and lets us verify end-to-end.
2. **Phase 5b — admin UI**: `packages/admin/src/pages/notification-settings/` (model after `commission-rates`; per-event Email/SMS toggles + `template_id`; OTP row read-only), wired via `get-route-map.tsx`; admin-page-ui/admin-form-ui/admin-ui-review skills. Needs codegen types from step 1.
3. **Phase 6 — vendor UI**: phone tab in `pages/login` + `pages/register` + `useRequestOtp`/`useVerifyOtp` hooks; fa/RTL (تامین‌کننده terminology).
4. **Phase 7** store customer create-with-phone; **Phase 8** integration tests (mock sms.ir) + build; **Phase 9** run migrations.
2. Then Phase 3 (member `phone` field + optional `member_email`), Phase 4 (catalog + settings module + pipeline + orchestrator), Phase 5/6 (admin page + vendor UI).
3. Generate migrations (`otp`, later `notification_settings`) and add integration tests with the sms.ir client mocked.

### Runnable validation: 2026-06-12 (full backend proven end-to-end)

After Phases 1-5a, ran the "make it runnable" step against a local Postgres scratch DB (`mercur_phaseval`, passwordless) + a temporary `apps/api/.env` (gitignored):

- **`bun run build`** = green, **9/9 packages** (incl. core codegen). The regenerated `@mercurjs/client` route map now types the new routes (`notificationSettings`, `auth/phone/{requestOtp,verifyOtp}`) — unblocks the dashboard UIs.
- **Migrations** (hand-written, MikroORM): `Migration20260612090001` (otp_code), `090002` (notification_channel_config), `090003` (member: add `phone`, `email` nullable, scoped unique indexes). `medusa db:migrate` succeeded; all three tables/columns/indexes verified in the DB. NOTE: module `.snapshot` files were NOT updated (a future `medusa db:generate` would re-diff) — acceptable; runtime runs the migration files, not snapshots.
- **Boot**: `medusa develop` → "Server is ready on port: 9000" with the `otp` + `notification_settings` modules, the injected Notification module + `notification-smsir` provider, and the `notification-orchestrator` subscriber all loaded cleanly.
- **End-to-end phone OTP (vendor)**: `request-otp` → `{success:true}` + hashed `otp_code` row + sms.ir client dev-logged the code; `verify-otp` with that code → valid JWT `{ token }` (actor_type member, auth_identity_id set), `provider_identity (phone-otp, entity_id=phone)` created, `otp_code` consumed (not reusable).
- **Endpoints mounted**: `GET /admin/notification-settings` → 401 (mounted + admin-protected); `/store/auth/phone/request-otp` → 400 (Medusa publishable-key gate, i.e. mounted).

Net: the entire feature backend (auth + notification platform) is runtime-verified. Remaining = dashboard UIs (5b admin, 6 vendor), store customer-with-phone (7), and formal Jest integration tests (8). The scratch DB + `apps/api/.env` are local-only (gitignored); the migration files are committed.

### Session 7: 2026-06-13 -- Phases 5-8 (admin UI, vendor UI, store customer, tests) + release to dfactories-mp

**Goal**: Finish the dashboards + storefront backend + tests, publish the fork packages, and deploy into dfactories-mp.

#### Completed

- **Phase 5 — admin notification-settings**: API (`api/admin/notification-settings/*`, commit `19affe3`) + UI page (`packages/admin/src/pages/notification-settings`, route + settings nav + en i18n, commit `c406feb`). Built with the admin-page-ui skill; `turbo build --filter=@mercurjs/admin` 5/5.
- **Phase 6 — vendor phone UI**: `PhoneAuthForm` + `useRequestOtp`/`useVerifyOtp`; Email/Phone tabs on login (`bb3483e`) and register (`324c57d`); register→onboarding threads `member_phone` through `useOnboarding`. fa+en i18n. vendor build 6/6.
- **Phase 7 — store customer**: store `verify-otp` creates/links a phone-only customer (customer.email is nullable; created via Modules.CUSTOMER since createCustomerAccountWorkflow forces email) (`64a427a`).
- **Phase 8 — integration tests**: `http/auth/vendor/phone-otp.spec.ts` (4), `http/auth/store/phone-otp.spec.ts` (2), `http/notification-settings/admin/notification-settings.spec.ts` (4) — all green. OTP code obtained via the OTP module service in-test (no sms.ir mock needed). Repaired the pre-broken `http/auth/vendor/auth.spec.ts` (wrong actor + missing member_email/currency_code) — now passes. 11/11.
- **Release + consumption**: published `@mercurjs/{core,types}@2.1.2-dfactories.12` (`ba3be46`), `@mercurjs/admin@…12` (`65fc8b9`), `@mercurjs/vendor@…12` (`3fc55a1`) via CI. Consumed in dfactories-mp on `develop`: api (`3de64b0`, + db:migrate), admin (`a2f157f`), vendor (`e7b3b54`); Vite caches cleared. SMSIR_API_KEY + SMSIR_OTP_TEMPLATE_ID already set in dfactories-mp/packages/api/.env.

#### Verification

- All new integration suites pass (11 tests). Per-package builds green (admin 5/5, vendor 6/6, core 0 tsc errors).
- Whole feature is deployed in dfactories-mp (backend live + migrated; admin/vendor bundles consumed — restart the dev servers to view).

#### Remaining / notes

- `smsir-transport` + `notification-pipeline` left `in_progress`: real sms.ir send (needs an approved template) and the full event→dispatch flow aren't e2e-tested (only the no-op path + the settings API are).
- sms.ir OTP template parameter name must match `SMSIR_OTP_PARAM_NAME` (default `CODE`).
- dfactories-mp commits are on `develop`, not pushed.

### Session 8: 2026-06-13 -- phone-auth UX fixes + bug fixes (release .13)

**Goal**: Address review feedback on the vendor phone flow.

#### Completed

- **Login/register separation** (`mode` on request-otp, checked before sending an SMS): login + no account -> 404 `PHONE_NOT_REGISTERED`; register + existing account -> `PHONE_ALREADY_REGISTERED`. Omitting `mode` keeps the unified behavior (storefront).
- **Bug 1 fix** (account first created by email, phone saved in profile): verify-otp now links a pre-existing member that already has the phone to the new phone-otp auth identity (member-by-phone, multi-format match `09…/+98…/98…/9…`), so phone login reaches their existing seller(s). store `ensureCustomerForAuthIdentity` likewise reuses an existing customer by phone.
- **"Create store" no longer bounces to login**: login passes the phone to `/store-select`, which forwards it to `/onboarding` (the guard needs email OR phone).
- **Resend code** with a 60s countdown (login + register).
- **Phone-only UI**: login + register render only `PhoneAuthForm` (email forms kept in code, not shown). **Forgot-password link removed** (reset-password page/route untouched).
- **Tests**: added vendor mode tests (login-unregistered 404, register-existing error, verify links existing member via decoded JWT `actor_id`). Existing phone-otp suites still green (6/6 regression).
- **Release**: `@mercurjs/{core,vendor}@2.1.2-dfactories.13` (commit `4739489`) published via CI; consumed in dfactories-mp (`86737be` on develop) — api core.13, apps/vendor + override vendor.13, Vite caches cleared, no new migration. core.13 also carries Phase 7. Restart packages/api + apps/vendor to view.

#### Notes

- If an existing `member.phone` is stored in a format outside the 4 matched variants, bug-1 linking won't match — surface the stored value to extend `phoneVariants`.

## Session 6 — Store phone OTP verification (2026-06-14)

Decision model (from 5 clarifying questions): a phone is **owned** when it's a
member's *login* phone OR a **verified** store phone. Unverified store phones
lock nothing (multiple stores may hold the same one; first to verify wins).
Login identity stays **member.phone only** — a verified store phone is a
verified *contact*, never a login credential. DB is clean, so no legacy/backfill.

#### Completed

- **seller.phone_verified_at** (`model.dateTime().nullable()`) + migration
  `Migration20260613120000` + `SellerDTO`/`UpdateSellerDTO` types + query-config.
- **phone-otp.ts refactor**: `findMemberIdByPhone` is now member-only (login);
  new `isPhoneTaken` = member phone OR verified store phone (registration lock).
  request-otp `register` mode uses `isPhoneTaken`; `login` uses member-only.
- **Store-phone verify routes** (authenticated, seller-scoped via `seller_context`):
  `POST /vendor/sellers/me/phone/{request-otp,verify-otp}`. request-otp
  auto-verifies (no SMS) when the store phone == owner's login phone; errors
  `PHONE_ALREADY_REGISTERED` if owned by another; otherwise sends a code
  (actor_type `seller_phone`). verify-otp re-checks ownership (race) then sets
  `phone_verified_at`.
- **Reset on change**: `POST /vendor/sellers/:id` nulls `phone_verified_at` when
  the store phone changes (server-side; not a client-settable field).
- **Vendor UI**: `store-phone-verification.tsx` — verified/unverified badge +
  verify button + OTP FocusModal (resend + 60s). Wired into store general
  section. Hooks `useRequestSellerPhoneOtp` / `useVerifySellerPhoneOtp`. fa+en i18n.
- **Tests**: `auth/vendor/phone-otp.spec.ts` now **13/13 green** — verified store
  phone locks registration; **unverified does NOT**; store-phone verify with code;
  auto-verify when == login phone; PHONE_ALREADY_REGISTERED when owned by another.
- `bun run build` (types→core→client→vendor) green.

## Session 7 — Register name + phone-first store contact (2026-06-14)

#### Completed

- **Register collects first/last name again**: `PhoneAuthForm` gained optional
  `extraFields` (ReactNode shown on step 1) + `beforeRequest` (gate) props;
  register renders name inputs there, validates, and stores them in the register
  draft → onboarding lands them on the seller member (member already had the
  fields; no backend change for this part).
- **Phone-first store contact**: `seller.email` is now **nullable**
  (`Migration20260614120000`); `SellerDTO`/`CreateSellerDTO.email` optional;
  `CreateSellerAccount` validator email optional. Store info forms (onboarding
  `store-step` + settings `edit-store-form`) now require **phone** and make
  **email optional**; `useOnboarding` sends `email || undefined`. fa+en
  `*.validation.phoneRequired` added.
- `bun run build` (types→core→client→vendor) green; `auth/vendor` tests 14/14.
- Released `@mercurjs/{core,vendor}@2.1.2-dfactories.16`.

## Session 8 — Vendor/admin batch: invites by phone, docs, avatar, polish (2026-06-14)

Ten-item batch (all built; `bun run build` 7/7 green). Released
`@mercurjs/{core,vendor,admin}@2.1.2-dfactories.17`.

#### Completed

- **#1+#10 Invite by phone (OTP-native)**: `MemberInvite` gained `phone` (email
  nullable) + migration; invite forms (vendor + admin) collect phone+role;
  `VendorInviteMember`/`AdminInviteSellerMember` require phone. On phone OTP
  **verify**, pending invites for that phone are auto-accepted (member created +
  joined seller(s) with role); request-otp `login` passes if a pending invite
  exists. `member_invite.created` registered in the notification catalog (SMS
  only) with an array-payload resolver → routes the invite SMS (params:
  seller_name, role). Orchestrator now try/catches (a notification failure never
  breaks the domain op).
- **#6 Avatar**: `member.photo` (+migration, DTOs, upsert, `VendorUpdateMember`)
  + FileUpload in vendor edit-profile.
- **#7 Store documents**: `professional_details.business_license` +
  `health_permit` (+migration, DTOs, validators vendor+admin). Vendor sidebar
  `StoreDocumentsSection` (below payment) → `documents` RouteDrawer upload
  (image+PDF). Admin professional-details form gained the two URL fields.
- **#2** team list: name + phone columns. **#8** admin members box shows phone.
- **#3** media tip i18n. **#4** handle slug regex (edit-store + onboarding).
  **#5** currency hint reused with IRR guidance. **#9** onboarding success screen
  (+ login button) instead of silent redirect.
- Migrations: `Migration20260614130000` (member.photo, prof-details docs,
  member_invite.phone + index).
- **Fixed a pre-existing route bug**: an already-registered member can create a
  second store without member_email/member_phone.
- Tests: `auth/vendor` 14/14, `notification-settings` 4/4, `seller/vendor` 53/58
  (the 5 failures are **pre-existing** payment-details, red at .16 baseline too —
  verified by stash). Updated 2 seller specs for the new email-optional / phone
  invite behavior.

## Session 9 — Mercur 2.3.1 upgrade, closed out (2026-08-24)

Branch `dfactories/2.3.1`, merged into `develop` and pushed. Published
`@mercurjs/core@2.3.1-dfactories.1`; every other package stayed at
`2.3.1-dfactories.0`.

### What the upgrade carries

- **Merge of upstream `v2.3.1`** (Medusa 2.17.2 → 2.18.0), plus the fork's own
  fixes on top: RTL logical properties in 2.3.1's new UI, 299 Persian keys,
  admin variant-update no longer accepting prices, and an "Advanced" nav section
  for installation-added routes.
- **`fix(commission)`** — commission is charged on `subtotal - discount ×
  marketplaceShare`, floored at 0, where the share comes from the promotion's
  `cost_bearer` (no `promotion_cost` record at all = `marketplace` = commission
  on the post-discount amount). Before this, a seller running a promotion paid
  commission on money the customer never handed over.
- **`fix(store)`** — 2.3.1 dropped the visible-seller filter from
  `/store/products`, which left the cheapest-offer lookup as the only thing
  keeping a suspended or mid-closure producer's price off the catalogue. It now
  scopes to visible sellers.
- **`fix(review)`** — `Migration20260823041742` adds the columns a database that
  ran the reviews REGISTRY BLOCK never gets. Core's create is guarded by
  `if not exists`, so such a database skips it whole and `db:migrate` reports
  success against a table with no `status`.
- **Migration-name guard** — `packages/core/src/modules/migration-names.spec.ts`
  fails the build on a duplicate name, ours or an installed `@medusajs/*`
  module's. It exists because `shipping-option-type-delivery` squatted
  `Migration20260625000000`, the name Medusa 2.18's order module uses, and every
  cart completion then failed with `column t5.metadata does not exist`.

### Verified this session

`bun run build` (12/12), `bun run lint` (0 errors), `bun run test:unit` (15
core + 63 vendor + 1 admin), `bun run scripts/generate-i18n-schema.ts --check`,
and the publish gate `integration-tests/http/dfactories/` — 5 suites, 40 tests,
against local Postgres + Redis.

### Fixed while closing out

- The four regression specs written for this release lived in the domain folders,
  so the publish gate (which runs only `http/dfactories/`) never ran any of them.
  Moved.
- `store-reviews.spec.ts` asserted nothing: the route scopes the list to the
  caller's own reviews and the seeded review was never linked to the customer,
  so every assertion passed against an empty array. It now proves the field
  selection the storefront sends resolves `seller`, and pins `pending` as the
  status a new review is created with.
- The rehearsal script now reports review row counts, the review columns, and how
  many rows sit in the block-era review link tables.

### Also fixed while closing out (2026-08-24, later)

`resolvePromotionCostShares` is now a plain exported function alongside the
workflow step, released as `@mercurjs/core@2.3.1-dfactories.2`. The agent
referral commission in `dfactories-mp` is deducted from the same vendor net as
the platform commission and was still charging a plain post-discount base, so any
`store` or `shared` promotion would have had the two layers billing different
bases for one line while both reported success. The consumer side landed in
`dfactories-mp@a0c65da`.

### Still open before this ships

**The production-clone rehearsal is being skipped — decided 2026-08-25.** It had
been recorded as mandatory. `mercur_231_rehearsal` locally is an empty schema
(0 orders, 0 sellers, 0 reviews, 21 MB), so nothing has ever been migrated
against real data: the maintenance window is unmeasured and the review link
handover has never moved a non-zero number of rows. `scripts/rehearse-231-migration.sh`
is still the cheapest way to retire that if a clone appears. The risk acceptance
and the pre-deploy backup that replaces it are written up in
`../dfactories-mp/docs/deploy-2.3.1.md`, which is also where the two one-time
deploy steps live.

## Required Artifacts (status)

- `claude-progress.md` -- this file (updated 2026-06-14, Session 8).
- `feature_list.json` -- present at repo root. Tracks 5 features (1 passing + 4 not_started for phone-auth/notifications).
- `session-handoff.md` -- present at repo root; updated 2026-06-12 with the phone-auth design handoff.
- `docs/features/phone-auth-and-notifications.md` -- design/decision record for the phone-auth + notification work.

## Definition Of Done (reminder)

A change is done only when:

- target behavior is implemented
- `bun run build` and `bun run lint` pass
- a relevant integration test was run (for behavior changes)
- evidence is recorded in this file
- the repo remains restartable from `bun install && bun run dev`
