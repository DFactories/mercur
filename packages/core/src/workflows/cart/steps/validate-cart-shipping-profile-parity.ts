import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import {
  cartRequiredShippingProfileIds,
  describeUnkeepableShippingOptions,
  findUnkeepableShippingOptions,
  type CartItemForShippingParity,
  type ShippingOptionForParity,
} from "../utils/shipping-profile-parity"

export type ValidateCartShippingProfileParityStepInput = {
  items: CartItemForShippingParity[] | null | undefined
  options: ShippingOptionForParity[] | null | undefined
  /** How many shipping methods the cart will hold once this add lands. */
  resultingMethodCount: number
}

/**
 * Refuse a shipping option the cart is about to lose again.
 *
 * BEFORE the method is written, not after: the failure this guards against is
 * silent — Medusa deletes the row on the next refresh and the buyer is left
 * looking at a cart that says it has no carriage, having just been told the
 * carriage was chosen. See `../utils/shipping-profile-parity` for the exact
 * Medusa branch and the measured timings.
 *
 * A 400 naming the profile is a worse checkout than one that works and a much
 * better one than a checkout that quietly drops what the buyer picked.
 */
export const validateCartShippingProfileParityStep = createStep(
  "validate-cart-shipping-profile-parity",
  (input: ValidateCartShippingProfileParityStepInput) => {
    const unkeepable = findUnkeepableShippingOptions({
      items: input.items,
      options: input.options,
      resultingMethodCount: input.resultingMethodCount,
    })

    if (unkeepable.length) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        describeUnkeepableShippingOptions(
          unkeepable,
          cartRequiredShippingProfileIds(input.items)
        )
      )
    }

    return new StepResponse(void 0)
  }
)
