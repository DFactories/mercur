import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // /vendor/* is auth-protected by @mercurjs/core's ensureSellerMiddleware,
  // which resolves the seller from the x-seller-id header / session via the
  // seller_member relationship and sets req.seller_context.seller_id. The auth
  // actor_id is the *member* id, not the seller id — so resolving the seller by
  // actor_id (the old block helper) returns nothing and crashes on .id.
  const sellerId = (
    req as unknown as { seller_context: { seller_id: string } }
  ).seller_context.seller_id

  const { data: notifications, metadata } = await query.graph({
    entity: "notification",
    fields: req.queryConfig.fields,
    filters: { channel: "seller_feed", to: sellerId },
    pagination: req.queryConfig.pagination,
  })

  res.json({
    notifications,
    count: metadata?.count,
    offset: metadata?.skip,
    limit: metadata?.take,
  })
}
