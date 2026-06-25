import {
  deleteShippingOptionsWorkflow,
  updateShippingOptionsWorkflow,
} from "@medusajs/core-flows"
import { FulfillmentWorkflow } from "@medusajs/framework/types"
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { HttpTypes } from "@mercurjs/types"

import {
  getTypeDeliveryDays,
  refetchShippingOption,
  validateSellerShippingOption,
} from "../helpers"
import { VendorUpdateShippingOptionType } from "../validators"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<HttpTypes.VendorShippingOptionResponse>
) => {
  const sellerId = req.seller_context!.seller_id

  await validateSellerShippingOption(req.scope, sellerId, req.params.id)

  const shippingOption = await refetchShippingOption(
    req.scope,
    req.params.id,
    req.queryConfig.fields
  )

  if (!shippingOption) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Shipping Option with id: ${req.params.id} not found`
    )
  }

  res.json({ shipping_option: shippingOption })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<VendorUpdateShippingOptionType>,
  res: MedusaResponse<HttpTypes.VendorShippingOptionResponse>
) => {
  const sellerId = req.seller_context!.seller_id

  await validateSellerShippingOption(req.scope, sellerId, req.params.id)

  const { metadata: bodyMetadata, ...shippingOptionPayload } = req.validatedBody

  // When the option's type changes, re-stamp the new type's admin-curated
  // delivery time onto the metadata. Medusa's update replaces the metadata
  // object, so merge onto the existing metadata to preserve other keys.
  let metadataUpdate: Record<string, unknown> | undefined = bodyMetadata
  const typeId = shippingOptionPayload.type_id
  if (typeId || bodyMetadata !== undefined) {
    const existing = await refetchShippingOption(req.scope, req.params.id, [
      "metadata",
    ])
    const days = typeId ? await getTypeDeliveryDays(req.scope, typeId) : null
    metadataUpdate = {
      ...((existing?.metadata as Record<string, unknown> | undefined) ?? {}),
      ...(bodyMetadata ?? {}),
      ...(days !== null ? { estimated_delivery_days: days } : {}),
    }
  }

  const workflow = updateShippingOptionsWorkflow(req.scope)

  const workflowInput: FulfillmentWorkflow.UpdateShippingOptionsWorkflowInput =
    {
      id: req.params.id,
      ...shippingOptionPayload,
      ...(metadataUpdate !== undefined ? { metadata: metadataUpdate } : {}),
    }

  const { result } = await workflow.run({
    input: [workflowInput],
  })

  const shippingOption = await refetchShippingOption(
    req.scope,
    result[0].id,
    req.queryConfig.fields
  )

  res.status(200).json({ shipping_option: shippingOption })
}

export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<HttpTypes.VendorShippingOptionDeleteResponse>
) => {
  const sellerId = req.seller_context!.seller_id
  const shippingOptionId = req.params.id

  await validateSellerShippingOption(req.scope, sellerId, shippingOptionId)

  const workflow = deleteShippingOptionsWorkflow(req.scope)

  await workflow.run({
    input: { ids: [shippingOptionId] },
  })

  res
    .status(200)
    .json({ id: shippingOptionId, object: "shipping_option", deleted: true })
}
