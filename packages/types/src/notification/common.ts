/**
 * Channels a notification event can be delivered over.
 * - `email` / `sms`: routed by the send-notification pipeline.
 * - `feed`: admin in-panel notification feed.
 * - `seller_feed`: vendor in-panel notification feed.
 * - `customer_feed`: buyer-facing feed in the storefront account panel.
 * - `agent_feed`: sales-agent feed in the storefront account panel.
 *
 * None of the `*_feed` channels are routed by the pipeline — a host subscriber
 * delivers them while honoring the per-event notification-settings toggle.
 *
 * `customer_feed` and `agent_feed` are separate channels rather than one
 * buyer-side feed because an operator must be able to silence agent chatter
 * without silencing the notices a buyer needs: the same person can be both, and
 * a single channel would make the two toggles the same switch.
 */
export type NotificationChannel =
  | "email"
  | "sms"
  | "feed"
  | "seller_feed"
  | "customer_feed"
  | "agent_feed"

/** Every in-panel feed channel, in one place, so a new one cannot be half-added. */
export const NOTIFICATION_FEED_CHANNELS = [
  "feed",
  "seller_feed",
  "customer_feed",
  "agent_feed",
] as const satisfies readonly NotificationChannel[]

/** Who an event notifies — drives grouping in the admin settings page. */
export type NotificationAudience = "customer" | "vendor" | "admin"

/**
 * What an event is ABOUT. The feed is grouped and filtered on this, so a
 * reviewer drowning in routine notices can still find the queue that is waiting
 * on them. It is a property of the event, not of the reader, which is why it
 * lives on the catalog rather than in each panel's UI: a panel-side list would
 * be a second source of truth that silently omits every event added later.
 */
export type NotificationCategory =
  | "approval"
  | "support"
  | "messaging"
  | "finance"
  | "commerce"
  | "account"
  | "agent"
  | "system"

/**
 * Whether somebody is WAITING on the reader.
 *
 * `action_required` means the notice names work only the recipient can clear
 * (a submission to review, a ticket to answer). `info` means it is a record of
 * something that already happened. The panels default their feed to
 * action-required and play the notification sound only for it.
 */
export type NotificationPriority = "action_required" | "info"

/**
 * A template variable an event exposes. Surfaced in the admin settings page so
 * operators know exactly which data each event's template can use, and to drive
 * the convention-default params_map (a template parameter named after a `key`
 * is auto-filled from that variable).
 */
export interface NotificationVariableDef {
  /** Variable name as referenced in templates / params_map (e.g. "reference"). */
  key: string
  /** Human label shown in admin (literal or i18n key). */
  label: string
  /** Example value shown next to the key (e.g. "SUP-100042"). */
  example?: string
  /** `payload` = from event.data; `recipient` = from the resolver's per-recipient data. */
  source: "payload" | "recipient"
}

/** A resolved recipient of a notification, produced by a catalog event's resolver. */
export interface NotificationRecipient {
  email?: string | null
  phone?: string | null
  /** Extra per-recipient data merged into the event payload for templating. */
  data?: Record<string, unknown>
}

/**
 * The normalized message the orchestrator subscriber hands to the
 * send-notification workflow. Domain code never talks to the notification
 * module directly — it emits a domain event that becomes one of these.
 */
export interface NotificationIntent {
  event_key: string
  payload: Record<string, unknown>
  occurred_at: string
  /** Idempotency key (usually the source event id) to avoid duplicate sends. */
  dedupe_key: string
}

/** One row of per-event, per-channel configuration (the `event × channel` table). */
export interface NotificationChannelConfigDTO {
  id: string
  event_key: string
  channel: NotificationChannel
  enabled: boolean
  /** sms.ir approved template id (SMS) or email template ref. */
  template_id: string | null
  /** Optional mapping of event payload fields to template parameters. */
  params_map: Record<string, unknown> | null
  /** Optional email subject override. */
  subject: string | null
  created_at: Date
  updated_at: Date
}

/**
 * A catalog event merged with its per-channel DB config — the shape the admin
 * notification-settings page renders (effective catalog = static ⋈ DB).
 */
export interface NotificationEventConfigDTO {
  event_key: string
  audience: NotificationAudience
  label: string
  description: string | null
  /** What the event is about — the feed groups and filters on it. */
  category: NotificationCategory
  /** Whether the event needs the recipient to do something. */
  priority: NotificationPriority
  /** System events (e.g. OTP) are shown read-only and never routed through the pipeline. */
  system: boolean
  available_channels: NotificationChannel[]
  channels: NotificationEventChannelStateDTO[]
  /** Template variables this event exposes — documentation + params_map source. */
  variables: NotificationVariableDef[]
}

export interface NotificationEventChannelStateDTO {
  channel: NotificationChannel
  enabled: boolean
  template_id: string | null
  /** True when this channel cannot be enabled until a template_id is provided (e.g. SMS). */
  template_required: boolean
  /** Operator override mapping template param name -> variable key. */
  params_map: Record<string, unknown> | null
  /** Optional title/subject override (feed/email). */
  subject: string | null
}
