import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import {
  cartRequiredShippingProfileIds,
  describeShippingOptionsWithoutGoods,
  findShippingOptionsWithoutGoods,
  type CartItemForShippingParity,
  type ShippingOptionForParity,
} from "../utils/shipping-profile-parity"

export type ValidateCartShippingProfileParityStepInput = {
  items: CartItemForShippingParity[] | null | undefined
  options: ShippingOptionForParity[] | null | undefined
}

/**
 * Refuse a shipping option completion would refuse.
 *
 * BEFORE the method is written, not at completion: completion runs in the
 * payment gateway's callback, so a carriage on a profile none of the cart's
 * offers ship from would surface only after the buyer had paid. See
 * `../utils/shipping-profile-parity` for the rule and its history.
 */
export const validateCartShippingProfileParityStep = createStep(
  "validate-cart-shipping-profile-parity",
  (input: ValidateCartShippingProfileParityStepInput) => {
    const withoutGoods = findShippingOptionsWithoutGoods({
      items: input.items,
      options: input.options,
    })

    if (withoutGoods.length) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        describeShippingOptionsWithoutGoods(
          withoutGoods,
          cartRequiredShippingProfileIds(input.items)
        )
      )
    }

    return new StepResponse(void 0)
  }
)
