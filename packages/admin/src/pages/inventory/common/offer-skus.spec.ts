import { describe, expect, it } from "vitest"

import { offerSkus } from "./offer-skus"

describe("offerSkus", () => {
  it("shows the offer's SKU for an item that has none of its own", () => {
    expect(offerSkus({ offers: [{ sku: "AL105-45-500" }] })).toBe(
      "AL105-45-500",
    )
  })

  it("lists each SKU once", () => {
    expect(
      offerSkus({ offers: [{ sku: "A" }, { sku: "A" }, { sku: "B" }] }),
    ).toBe("A، B")
  })

  it("is empty without offers", () => {
    expect(offerSkus({ offers: null })).toBe("")
  })
})
