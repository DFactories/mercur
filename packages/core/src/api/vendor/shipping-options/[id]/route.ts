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
  //
  // A "type change" is picking an admin type (`type_id`) OR switching to a
  // custom inline `type`. Either way the stamp is re-evaluated: if the new type
  // has an admin delivery time it wins; otherwise (custom type, or a type with
  // no delivery set) any STALE `estimated_delivery_days` from the previous type
  // is cleared so the settlement hold falls back to the default instead of using
  // the old type's time. (An explicit manual value in the request body is kept.)
  let metadataUpdate: Record<string, unknown> | undefined = bodyMetadata
  const typeId = shippingOptionPayload.type_id
  const typeChanged =
    typeId !== undefined || shippingOptionPayload.type !== undefined
  if (typeChanged || bodyMetadata !== undefined) {
    const existing = await refetchShippingOption(req.scope, req.params.id, [
      "metadata",
    ])
    const merged: Record<string, unknown> = {
      ...((existing?.metadata as Record<string, unknown> | undefined) ?? {}),
      ...(bodyMetadata ?? {}),
    }
    if (typeChanged) {
      const days = typeId ? await getTypeDeliveryDays(req.scope, typeId) : null
      if (days !== null) {
        merged.estimated_delivery_days = days
      } else if (
        bodyMetadata === undefined ||
        !("estimated_delivery_days" in bodyMetadata)
      ) {
        // Explicitly null (not delete) the stale value: Medusa MERGES metadata on
        // update, so omitting the key would keep the previous type's time. Null
        // is what the settlement hold reads as "unset" → falls back to default.
        merged.estimated_delivery_days = null
      }
    }
    metadataUpdate = merged
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
