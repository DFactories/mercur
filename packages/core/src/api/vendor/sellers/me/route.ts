import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { HttpTypes } from "@mercurjs/types"

import { VendorUpdateSellerType } from "../validators"
import { updateSellersWorkflow } from "../../../../workflows/seller"
import { withPhoneVerificationReset } from "../../../utils/sellers"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<HttpTypes.VendorSellerResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const sellerId =  req.seller_context!.seller_id

  const {
    data: [seller],
  } = await query.graph({
    entity: "seller",
    fields: req.queryConfig.fields,
    filters: { id: sellerId },
  })

  res.json({ seller })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<VendorUpdateSellerType>,
  res: MedusaResponse<HttpTypes.VendorSellerResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const sellerId = req.seller_context!.seller_id

  const { additional_data, ...rest } = req.validatedBody

  // Same rule as `/vendor/sellers/:id`: a changed store phone loses whatever
  // the old number had verified.
  const update = await withPhoneVerificationReset(req.scope, sellerId, rest)

  await updateSellersWorkflow(req.scope).run({
    input: {
      selector: { id: sellerId },
      update,
      additional_data,
    },
  })

  const {
    data: [seller],
  } = await query.graph({
    entity: "seller",
    fields: req.queryConfig.fields,
    filters: { id: sellerId },
  })

  res.json({ seller })
}
