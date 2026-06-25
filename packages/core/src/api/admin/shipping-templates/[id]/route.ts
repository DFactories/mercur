import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "zod"

import {
  SHIPPING_OPTION_TYPE_DELIVERY_MODULE,
  ShippingOptionTypeDeliveryModuleService,
} from "../../../../modules/shipping-option-type-delivery"

// `:id` is the shipping_option_type id. Mounted under /admin/shipping-templates
// (a Mercur-owned path) rather than /admin/shipping-option-types/* so it is not
// subject to Medusa's core RBAC permission guard on that resource — it only
// requires admin authentication, like the other /admin Mercur routes.

/**
 * GET /admin/shipping-templates/:id
 * Returns the admin-curated delivery info for a shipping option type (or null).
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) {
  const { id } = req.params
  const service = req.scope.resolve<ShippingOptionTypeDeliveryModuleService>(
    SHIPPING_OPTION_TYPE_DELIVERY_MODULE
  )

  const [delivery] = await service.listShippingOptionTypeDeliveries({
    shipping_option_type_id: id,
  })

  return res.json({ delivery: delivery ?? null })
}

const UpsertSchema = z.object({
  estimated_delivery_days: z.coerce
    .number()
    .int()
    .min(0)
    .max(365)
    .nullable()
    .optional(),
  carrier: z.string().min(1).max(100).nullable().optional(),
})

export type UpsertTypeDeliveryBody = z.infer<typeof UpsertSchema>

/**
 * POST /admin/shipping-templates/:id
 * Upsert the delivery info (estimated_delivery_days / carrier) for a shipping
 * option type — the admin "template" config the vendor option flow stamps onto
 * an option's metadata.
 */
export async function POST(
  req: AuthenticatedMedusaRequest<UpsertTypeDeliveryBody>,
  res: MedusaResponse
) {
  const { id } = req.params
  const parsed = UpsertSchema.safeParse(req.body)
  if (!parsed.success) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      parsed.error.errors.map((e) => e.message).join(", ")
    )
  }

  const service = req.scope.resolve<ShippingOptionTypeDeliveryModuleService>(
    SHIPPING_OPTION_TYPE_DELIVERY_MODULE
  )

  const [existing] = await service.listShippingOptionTypeDeliveries({
    shipping_option_type_id: id,
  })

  const delivery = existing
    ? await service.updateShippingOptionTypeDeliveries({
        id: existing.id,
        ...parsed.data,
      })
    : await service.createShippingOptionTypeDeliveries({
        shipping_option_type_id: id,
        ...parsed.data,
      })

  return res.json({ delivery })
}
