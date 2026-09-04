import {
  deleteShippingProfileWorkflow,
  updateShippingProfilesWorkflow,
} from "@medusajs/core-flows"
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { HttpTypes } from "@mercurjs/types"

import { getSellerShippingProfileGoodsCount } from "../../../utils"
import {
  refetchShippingProfile,
  validateSellerOrGlobalShippingProfile,
  validateSellerShippingProfile,
} from "../helpers"
import { VendorUpdateShippingProfileType } from "../validators"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<HttpTypes.VendorShippingProfileResponse>
) => {
  const sellerId = req.seller_context!.seller_id

  // Read-only: own OR a global admin profile (writes below stay owner-only).
  await validateSellerOrGlobalShippingProfile(req.scope, sellerId, req.params.id)

  const shippingProfile = await refetchShippingProfile(
    req.scope,
    req.params.id,
    req.queryConfig.fields
  )

  // Seller-scoped, so it cannot be a stored column: the same global profile
  // carries a different number of goods for every vendor that reads it.
  const seller_product_count = await getSellerShippingProfileGoodsCount(
    req.scope,
    sellerId,
    req.params.id
  )

  res.status(200).json({
    shipping_profile: { ...shippingProfile, seller_product_count },
  })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<VendorUpdateShippingProfileType>,
  res: MedusaResponse<HttpTypes.VendorShippingProfileResponse>
) => {
  const sellerId = req.seller_context!.seller_id
  const { id } = req.params

  await validateSellerShippingProfile(req.scope, sellerId, id)

  await updateShippingProfilesWorkflow(req.scope).run({
    input: { selector: { id }, update: req.validatedBody },
  })

  const shippingProfile = await refetchShippingProfile(
    req.scope,
    id,
    req.queryConfig.fields
  )

  res.status(200).json({ shipping_profile: shippingProfile })
}

export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<HttpTypes.VendorShippingProfileDeleteResponse>
) => {
  const sellerId = req.seller_context!.seller_id
  const { id } = req.params

  await validateSellerShippingProfile(req.scope, sellerId, id)

  await deleteShippingProfileWorkflow(req.scope).run({
    input: { ids: [id] },
  })

  res.status(200).json({
    id,
    object: "shipping_profile",
    deleted: true,
  })
}
