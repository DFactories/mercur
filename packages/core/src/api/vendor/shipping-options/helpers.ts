import {
  BatchMethodResponse,
  MedusaContainer,
  ShippingOptionRuleDTO,
} from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  promiseAll,
} from "@medusajs/framework/utils"

export const validateSellerShippingOption = async (
  scope: MedusaContainer,
  sellerId: string,
  shippingOptionId: string
) => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [sellerShippingOption],
  } = await query.graph({
    entity: "shipping_option_seller",
    filters: {
      seller_id: sellerId,
      shipping_option_id: shippingOptionId,
    },
    fields: ["seller_id"],
  })

  if (!sellerShippingOption) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Shipping option with id: ${shippingOptionId} was not found`
    )
  }
}

/**
 * Resolve the admin-curated delivery time (days) for a shipping option type, or
 * null when none is set. Used to stamp the type's delivery onto a shipping
 * option's metadata at create/update so the settlement hold can floor the return
 * window. Best-effort: any error → null (the settlement falls back to a default).
 */
export const getTypeDeliveryDays = async (
  scope: MedusaContainer,
  typeId: string
): Promise<number | null> => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  try {
    const {
      data: [type],
    } = await query.graph({
      entity: "shipping_option_type",
      filters: { id: typeId },
      fields: ["id", "delivery.estimated_delivery_days"],
    })
    const days = (type as { delivery?: { estimated_delivery_days?: number | null } })
      ?.delivery?.estimated_delivery_days
    return days === null || days === undefined ? null : Number(days)
  } catch {
    return null
  }
}

export const refetchShippingOption = async (
  scope: MedusaContainer,
  shippingOptionId: string,
  fields: string[]
) => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [shippingOption],
  } = await query.graph({
    entity: "shipping_option",
    filters: { id: shippingOptionId },
    fields,
  })

  return shippingOption
}

export const refetchBatchRules = async (
  batchResult: BatchMethodResponse<ShippingOptionRuleDTO>,
  scope: MedusaContainer,
  fields: string[]
) => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  let created = Promise.resolve<ShippingOptionRuleDTO[]>([])
  let updated = Promise.resolve<ShippingOptionRuleDTO[]>([])

  if (batchResult.created.length) {
    created = query
      .graph({
        entity: "shipping_option_rule",
        filters: { id: batchResult.created.map((p) => p.id) },
        fields,
      })
      .then(({ data }) => data)
  }

  if (batchResult.updated.length) {
    updated = query
      .graph({
        entity: "shipping_option_rule",
        filters: { id: batchResult.updated.map((p) => p.id) },
        fields,
      })
      .then(({ data }) => data)
  }

  const [createdRes, updatedRes] = await promiseAll([created, updated])
  return {
    created: createdRes,
    updated: updatedRes,
    deleted: {
      ids: batchResult.deleted,
      object: "shipping_option_rule",
      deleted: true,
    },
  }
}
