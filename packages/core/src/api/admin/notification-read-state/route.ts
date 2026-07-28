import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { MercurModules } from "@mercurjs/types"

import NotificationSettingsModuleService from "../../../modules/notification-settings/service"

type ReadStateResponse = { last_read_at: string | null }

/**
 * Read state for the operator feed. The feed itself is a broadcast — every
 * operator sees the same rows — so "read" is tracked per admin user here rather
 * than on the notification.
 */
const getActorId = (req: AuthenticatedMedusaRequest): string => {
  const actorId = req.auth_context?.actor_id
  if (!actorId) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "No authenticated admin user on the request"
    )
  }
  return actorId
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<ReadStateResponse>
) => {
  const service = req.scope.resolve<NotificationSettingsModuleService>(
    MercurModules.NOTIFICATION_SETTINGS
  )

  const lastReadAt = await service.getLastReadAt({
    actor_type: "user",
    actor_id: getActorId(req),
  })

  res.json({ last_read_at: lastReadAt ? lastReadAt.toISOString() : null })
}

export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<ReadStateResponse>
) => {
  const service = req.scope.resolve<NotificationSettingsModuleService>(
    MercurModules.NOTIFICATION_SETTINGS
  )

  const lastReadAt = await service.markReadAt({
    actor_type: "user",
    actor_id: getActorId(req),
  })

  res.json({ last_read_at: lastReadAt.toISOString() })
}
