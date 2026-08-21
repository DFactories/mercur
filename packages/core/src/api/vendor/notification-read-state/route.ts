import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { MercurModules } from "@mercurjs/types"

import NotificationSettingsModuleService from "../../../modules/notification-settings/service"

type ReadStateResponse = { last_read_at: string | null }

/**
 * Read state for the seller feed. Tracked per member, not per seller — several
 * members share one store's feed and each reads it on their own.
 */
const getActorId = (req: AuthenticatedMedusaRequest): string => {
  const actorId = req.auth_context?.actor_id
  if (!actorId) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "No authenticated member on the request"
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
    actor_type: "member",
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
    actor_type: "member",
    actor_id: getActorId(req),
  })

  res.json({ last_read_at: lastReadAt.toISOString() })
}
