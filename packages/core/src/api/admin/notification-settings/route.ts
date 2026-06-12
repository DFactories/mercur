import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MercurModules, NotificationEventConfigDTO } from "@mercurjs/types"

import { AdminUpdateNotificationSettingsType } from "./validators"
import NotificationSettingsModuleService from "../../../modules/notification-settings/service"
import { listNotificationEvents } from "../../../notification/catalog"

type NotificationSettingsResponse = {
  notification_settings: NotificationEventConfigDTO[]
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<NotificationSettingsResponse>
) => {
  const service = req.scope.resolve<NotificationSettingsModuleService>(
    MercurModules.NOTIFICATION_SETTINGS
  )
  const notification_settings = await service.getEffectiveCatalog()
  res.json({ notification_settings })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<AdminUpdateNotificationSettingsType>,
  res: MedusaResponse<NotificationSettingsResponse>
) => {
  const service = req.scope.resolve<NotificationSettingsModuleService>(
    MercurModules.NOTIFICATION_SETTINGS
  )

  // Only allow configuring real (non-system) event × available-channel combos.
  const allowed = new Set<string>()
  for (const event of listNotificationEvents()) {
    if (event.system) {
      continue
    }
    for (const channel of event.availableChannels) {
      allowed.add(`${event.key}:${channel}`)
    }
  }

  const updates = req.validatedBody.updates.filter((u) =>
    allowed.has(`${u.event_key}:${u.channel}`)
  )

  if (updates.length) {
    await service.upsertChannelConfigs(updates)
  }

  const notification_settings = await service.getEffectiveCatalog()
  res.json({ notification_settings })
}
