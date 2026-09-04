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
import { HttpTypes } from "@mercurjs/types"

import { getSellerShippingProfileGoodsCounts } from "../../utils"
import { isShippingProfileWithoutGoods } from "../../../workflows/cart/utils/shipping-profile-parity"

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

/**
 * The vendor-side half of the shipping-profile parity rule.
 *
 * The buyer-side guard (`validateCartShippingProfileParityStep`) asks the same
 * question of a cart and answers with a 400, because by then the only thing
 * left to protect is the checkout. Here the question is asked of the seller's
 * own catalogue while the option is still being written, and the answer is a
 * warning rather than a refusal: creating the option before moving goods onto
 * its profile is a legitimate order of work, and refusing it would close that
 * door for no gain — the option is harmless until a buyer's basket holds two
 * producers.
 */
export const buildShippingProfileGoodsWarning = async (
  scope: MedusaContainer,
  sellerId: string,
  shippingProfileId: string | null | undefined
): Promise<HttpTypes.VendorShippingOptionProfileWarning | undefined> => {
  if (!shippingProfileId) {
    return undefined
  }

  const counts = await getSellerShippingProfileGoodsCounts(scope, sellerId)

  if (!isShippingProfileWithoutGoods(shippingProfileId, new Set(counts.keys()))) {
    return undefined
  }

  return {
    code: "shipping_profile_carries_no_goods",
    shipping_profile_id: shippingProfileId,
    seller_product_count: 0,
    message:
      `None of your products are on shipping profile ${shippingProfileId}, so ` +
      `this shipping option carries nothing. A buyer whose basket holds more ` +
      `than one seller's carriage will not be able to choose it. Move the ` +
      `option to a profile your goods use, or move the goods onto this profile.`,
  }
}
