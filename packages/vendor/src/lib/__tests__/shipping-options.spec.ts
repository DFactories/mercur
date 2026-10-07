import { describe, expect, it } from "vitest"

import {
  getShippingProfileName,
  isCartScopedOption,
  isSelectableShippingType,
  isUnpricedShippingType,
  unpricedShippingPrices,
} from "../shipping-options"

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

describe("getShippingProfileName", () => {
  // The admin-curated profiles every producer picks from carry a bare name.
  // `split(":")[1]` turned each into `undefined`, and the edit form's combobox
  // then printed the profile id where its name belongs.
  it("keeps a bare name", () => {
    expect(getShippingProfileName("استاندارد (عادی)")).toBe("استاندارد (عادی)")
  })

  it("drops an owner prefix", () => {
    expect(getShippingProfileName("sel_1:مرسوله شکستنی")).toBe("مرسوله شکستنی")
  })

  it("keeps a colon inside the name itself", () => {
    expect(getShippingProfileName("sel_1:بار: سنگین")).toBe("بار: سنگین")
  })
})

describe("isUnpricedShippingType", () => {
  it("covers freight collect and freight on request", () => {
    expect(isUnpricedShippingType("freight_collect")).toBe(true)
    expect(isUnpricedShippingType("freight_quote")).toBe(true)
  })

  it("leaves priced carriers, the minted quote type and a missing code alone", () => {
    expect(isUnpricedShippingType("tipax")).toBe(false)
    expect(isUnpricedShippingType("quote_freight")).toBe(false)
    expect(isUnpricedShippingType(undefined)).toBe(false)
  })

  it("stores an unpriced option at zero in one currency", () => {
    expect(unpricedShippingPrices("irr")).toEqual([
      { currency_code: "irr", amount: 0 },
    ])
  })
})

describe("isSelectableShippingType", () => {
  it("hides the type minted for one cart's agreed carriage", () => {
    expect(isSelectableShippingType("quote_freight")).toBe(false)
    expect(isSelectableShippingType("freight_quote")).toBe(true)
    expect(isSelectableShippingType("freight_collect")).toBe(true)
  })
})
