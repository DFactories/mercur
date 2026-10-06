import { describe, expect, it } from "vitest"

import { isCartScopedOption } from "../shipping-options"

describe("isCartScopedOption", () => {
  it("recognises an option minted for one cart", () => {
    expect(
      isCartScopedOption({
        rules: [
          { attribute: "cart_id", operator: "eq", value: "cart_1" },
          { attribute: "enabled_in_store", operator: "eq", value: "true" },
        ],
      } as never),
    ).toBe(true)
  })

  it("leaves a store's own option alone", () => {
    expect(
      isCartScopedOption({
        rules: [{ attribute: "enabled_in_store", operator: "eq", value: "true" }],
      } as never),
    ).toBe(false)
  })
})
