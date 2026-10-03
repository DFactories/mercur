import { describe, expect, it } from "vitest"

import { StoreAddCartLineItem } from "../validators"

/**
 * The price boundary, pinned at the schema.
 *
 * This route's handler spreads whatever survives validation into
 * `addToCartWorkflow`, so anything this schema ACCEPTS is honoured. A
 * `unit_price` here is not a harmless extra field — it is a shopper naming
 * their own price. It was declared here for a long time, with only a
 * downstream middleware standing between it and a cart.
 */
describe("StoreAddCartLineItem", () => {
  it("takes an offer and a quantity", () => {
    expect(() =>
      StoreAddCartLineItem.parse({ offer_id: "offer_1", quantity: 2 })
    ).not.toThrow()
  })

  it.each(["unit_price", "compare_at_unit_price"])(
    "refuses a client-supplied %s",
    (field) => {
      expect(() =>
        StoreAddCartLineItem.parse({
          offer_id: "offer_1",
          quantity: 1,
          [field]: 1,
        })
      ).toThrow()
    }
  )

  it("refuses any unrecognised field, not merely prices", () => {
    // `.strict()` makes the absence of a field an active refusal rather than a
    // silent drop, so the next price-shaped field somebody invents is refused
    // too — without anyone remembering to add it here.
    expect(() =>
      StoreAddCartLineItem.parse({
        offer_id: "offer_1",
        quantity: 1,
        price_override: 1,
      })
    ).toThrow()
  })

  it("still allows metadata and additional_data", () => {
    expect(() =>
      StoreAddCartLineItem.parse({
        offer_id: "offer_1",
        quantity: 1,
        metadata: { note: "x" },
        additional_data: { source: "test" },
      })
    ).not.toThrow()
  })
})
