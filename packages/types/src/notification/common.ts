/** Channels a notification event can be delivered over. */
export type NotificationChannel = "email" | "sms" | "feed"

/** Who an event notifies — drives grouping in the admin settings page. */
export type NotificationAudience = "customer" | "vendor" | "admin"

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
  /** System events (e.g. OTP) are shown read-only and never routed through the pipeline. */
  system: boolean
  available_channels: NotificationChannel[]
  channels: NotificationEventChannelStateDTO[]
}

export interface NotificationEventChannelStateDTO {
  channel: NotificationChannel
  enabled: boolean
  template_id: string | null
  /** True when this channel cannot be enabled until a template_id is provided (e.g. SMS). */
  template_required: boolean
}
