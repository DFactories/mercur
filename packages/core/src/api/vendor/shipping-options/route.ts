import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { HttpTypes } from "@mercurjs/types"

import { createSellerShippingOptionsWorkflow } from "../../../workflows/shipping-option"
import { refetchShippingOption } from "./helpers"
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

  // Fold `estimated_delivery_days` into metadata as a real number (not a string)
  // so it stays usable in date math downstream (settlement hold floor). It is
  // dropped from the top level so only the standard shipping-option fields
  // (incl. metadata) reach the workflow.
  const { estimated_delivery_days, ...shippingOptionInput } = req.validatedBody
  if (estimated_delivery_days !== undefined) {
    shippingOptionInput.metadata = {
      ...(shippingOptionInput.metadata ?? {}),
      estimated_delivery_days,
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

  res.status(201).json({ shipping_option: shippingOption })
}
