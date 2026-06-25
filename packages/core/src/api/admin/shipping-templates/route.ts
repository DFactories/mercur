import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * GET /admin/shipping-templates
 *
 * Lists all shipping option types together with their admin-curated delivery
 * info (via the read-only `shipping_option_type.delivery` link), so the admin UI
 * can render + edit the "templates" in one call. Lives under a Mercur-owned
 * /admin path (only needs admin auth) rather than the RBAC-guarded core
 * /admin/shipping-option-types.
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: shipping_templates, metadata } = await query.graph({
    entity: "shipping_option_type",
    fields: [
      "id",
      "label",
      "code",
      "description",
      "delivery.estimated_delivery_days",
      "delivery.carrier",
    ],
    pagination: {
      take: req.queryConfig?.pagination?.take ?? 100,
      skip: req.queryConfig?.pagination?.skip ?? 0,
    },
  })

  return res.json({
    shipping_templates,
    count: metadata?.count ?? shipping_templates.length,
    offset: metadata?.skip ?? 0,
    limit: metadata?.take ?? shipping_templates.length,
  })
}
