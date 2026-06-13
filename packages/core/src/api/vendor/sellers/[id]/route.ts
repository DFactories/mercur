import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { HttpTypes } from "@mercurjs/types"

import { VendorUpdateSellerType } from "../validators"
import { updateSellersWorkflow } from "../../../../workflows/seller"
import { normalizeIranPhone } from "../../../utils/phone-otp"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<HttpTypes.VendorSellerResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [seller],
  } = await query.graph({
    entity: "seller",
    fields: req.queryConfig.fields,
    filters: { id: req.params.id },
  })

  if (!seller) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Seller with id: ${req.params.id} was not found`
    )
  }

  res.json({ seller })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<VendorUpdateSellerType>,
  res: MedusaResponse<HttpTypes.VendorSellerResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const update: VendorUpdateSellerType & { phone_verified_at?: Date | null } = {
    ...req.validatedBody,
  }

  // Changing the store phone invalidates any prior OTP verification — the new
  // number must be re-verified (or auto-verified if it's the owner's own phone).
  if (typeof update.phone === "string") {
    const {
      data: [current],
    } = await query.graph({
      entity: "seller",
      fields: ["phone"],
      filters: { id: req.params.id },
    })
    const currentPhone = (current?.phone as string | null) ?? ""
    if (normalizeIranPhone(currentPhone) !== normalizeIranPhone(update.phone)) {
      update.phone_verified_at = null
    }
  }

  await updateSellersWorkflow(req.scope).run({
    input: {
      selector: { id: req.params.id },
      update,
    },
  })

  const {
    data: [seller],
  } = await query.graph({
    entity: "seller",
    fields: req.queryConfig.fields,
    filters: { id: req.params.id },
  })

  res.json({ seller })
}
