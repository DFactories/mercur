import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { HttpTypes } from "@mercurjs/types"

import { createSellerShippingOptionsWorkflow } from "../../../workflows/shipping-option"
import {
  buildShippingProfileGoodsWarning,
  getTypeDeliveryDays,
  refetchShippingOption,
} from "./helpers"
import { VendorCreateShippingOptionType } from "./validators"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<HttpTypes.VendorShippingOptionListResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: shipping_options, metadata } = await query.graph({
    entity: "shipping_option",
    fields: req.queryConfig.fields,
    filters: req.filterableFields,
    pagination: req.queryConfig.pagination,
  })

  res.json({
    shipping_options,
    count: metadata?.count ?? 0,
    offset: metadata?.skip ?? 0,
    limit: metadata?.take ?? 0,
  })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<VendorCreateShippingOptionType>,
  res: MedusaResponse<HttpTypes.VendorShippingOptionResponse>
) => {
  const sellerId = req.seller_context!.seller_id

  // Stamp the chosen type's admin-curated delivery time onto the option metadata
  // (usable in date math downstream — the settlement hold floor). The type's
  // delivery is authoritative; the vendor never sets it directly.
  const shippingOptionInput = { ...req.validatedBody }
  if (shippingOptionInput.type_id) {
    const days = await getTypeDeliveryDays(req.scope, shippingOptionInput.type_id)
    if (days !== null) {
      shippingOptionInput.metadata = {
        ...(shippingOptionInput.metadata ?? {}),
        estimated_delivery_days: days,
      }
    }
  }

  const { result } = await createSellerShippingOptionsWorkflow(req.scope).run({
    input: {
      seller_id: sellerId,
      shipping_options: [shippingOptionInput],
    },
  })

  const shippingOption = await refetchShippingOption(
    req.scope,
    result[0].id,
    req.queryConfig.fields
  )

  const warning = await buildShippingProfileGoodsWarning(
    req.scope,
    sellerId,
    shippingOptionInput.shipping_profile_id
  )

  res
    .status(201)
    .json({ shipping_option: shippingOption, ...(warning ? { warning } : {}) })
}
