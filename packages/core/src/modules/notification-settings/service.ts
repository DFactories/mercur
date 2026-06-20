import { MedusaService } from "@medusajs/framework/utils"
import {
  NotificationChannel,
  NotificationEventConfigDTO,
} from "@mercurjs/types"

import { listNotificationEvents } from "../../notification/catalog"
import { NotificationChannelConfig } from "./models"

/** Channels that may only be enabled once an approved template id is provided. */
const TEMPLATE_REQUIRED_CHANNELS: NotificationChannel[] = ["sms"]

export type ChannelDeliveryConfig = {
  channel: NotificationChannel
  enabled: boolean
  template_id: string | null
  params_map: Record<string, unknown> | null
  subject: string | null
}

export type UpsertChannelConfigInput = {
  event_key: string
  channel: NotificationChannel
  enabled?: boolean
  template_id?: string | null
  params_map?: Record<string, unknown> | null
  subject?: string | null
}

type StoredConfig = {
  id: string
  event_key: string
  channel: string
  enabled: boolean
  template_id: string | null
  params_map: Record<string, unknown> | null
  subject: string | null
}

function templateRequired(channel: NotificationChannel): boolean {
  return TEMPLATE_REQUIRED_CHANNELS.includes(channel)
}

const FEED_CHANNELS: NotificationChannel[] = ["feed", "seller_feed"]

/**
 * Default ON-state for a channel with no config row. Feed channels follow the
 * event's `defaultFeedEnabled` (host curation); sms/email always default off
 * (admin opts in, sms additionally gated on a template id).
 */
function noRowDefault(
  channel: NotificationChannel,
  feedDefault: boolean
): boolean {
  return FEED_CHANNELS.includes(channel) ? feedDefault : false
}

/** Effective "enabled": a template-gated channel is off until it has a template id. */
function effectiveEnabled(
  channel: NotificationChannel,
  rowEnabled: boolean,
  templateId: string | null,
  isSystem: boolean,
  hasRow: boolean,
  feedDefault: boolean
): boolean {
  if (isSystem) {
    return false
  }
  const base = hasRow ? rowEnabled : noRowDefault(channel, feedDefault)
  if (templateRequired(channel)) {
    return base && !!templateId
  }
  return base
}

class NotificationSettingsModuleService extends MedusaService({
  NotificationChannelConfig,
}) {
  private async loadConfigMap(): Promise<Map<string, StoredConfig>> {
    const rows = (await this.listNotificationChannelConfigs(
      {},
      {}
    )) as unknown as StoredConfig[]
    const map = new Map<string, StoredConfig>()
    for (const row of rows) {
      map.set(`${row.event_key}:${row.channel}`, row)
    }
    return map
  }

  /** The merged catalog the admin page renders: static defs ⋈ DB rows. */
  async getEffectiveCatalog(): Promise<NotificationEventConfigDTO[]> {
    const events = listNotificationEvents()
    const configMap = await this.loadConfigMap()

    return events.map((event) => ({
      event_key: event.key,
      audience: event.audience,
      label: event.label,
      description: event.description ?? null,
      system: !!event.system,
      available_channels: event.availableChannels,
      variables: event.variables ?? [],
      channels: event.availableChannels.map((channel) => {
        const row = configMap.get(`${event.key}:${channel}`)
        return {
          channel,
          enabled: effectiveEnabled(
            channel,
            row?.enabled ?? false,
            row?.template_id ?? null,
            !!event.system,
            !!row,
            event.defaultFeedEnabled ?? false
          ),
          template_id: row?.template_id ?? null,
          template_required: templateRequired(channel),
          params_map: row?.params_map ?? null,
          subject: row?.subject ?? null,
        }
      }),
    }))
  }

  /** Per-channel delivery config for one event, used by the pipeline's policy stage. */
  async getDeliveryConfig(eventKey: string): Promise<ChannelDeliveryConfig[]> {
    const event = listNotificationEvents().find((e) => e.key === eventKey)
    if (!event || event.system) {
      return []
    }
    const configMap = await this.loadConfigMap()

    return event.availableChannels.map((channel) => {
      const row = configMap.get(`${eventKey}:${channel}`)
      return {
        channel,
        enabled: effectiveEnabled(
          channel,
          row?.enabled ?? false,
          row?.template_id ?? null,
          false,
          !!row,
          event.defaultFeedEnabled ?? false
        ),
        template_id: row?.template_id ?? null,
        params_map: row?.params_map ?? null,
        subject: row?.subject ?? null,
      }
    })
  }

  /** Upsert per (event_key, channel) — used by the admin settings POST. */
  async upsertChannelConfigs(
    updates: UpsertChannelConfigInput[]
  ): Promise<void> {
    const configMap = await this.loadConfigMap()

    const toCreate: UpsertChannelConfigInput[] = []
    const toUpdate: (UpsertChannelConfigInput & { id: string })[] = []

    for (const update of updates) {
      const existing = configMap.get(`${update.event_key}:${update.channel}`)
      if (existing) {
        toUpdate.push({ ...update, id: existing.id })
      } else {
        toCreate.push(update)
      }
    }

    if (toCreate.length) {
      await this.createNotificationChannelConfigs(
        toCreate.map((c) => ({
          event_key: c.event_key,
          channel: c.channel,
          enabled: c.enabled ?? false,
          template_id: c.template_id ?? null,
          params_map: c.params_map ?? null,
          subject: c.subject ?? null,
        }))
      )
    }

    if (toUpdate.length) {
      await this.updateNotificationChannelConfigs(
        toUpdate.map((c) => ({
          id: c.id,
          ...(c.enabled !== undefined ? { enabled: c.enabled } : {}),
          ...(c.template_id !== undefined ? { template_id: c.template_id } : {}),
          ...(c.params_map !== undefined ? { params_map: c.params_map } : {}),
          ...(c.subject !== undefined ? { subject: c.subject } : {}),
        }))
      )
    }
  }
}

export default NotificationSettingsModuleService
