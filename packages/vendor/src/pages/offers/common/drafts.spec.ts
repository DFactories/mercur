import { describe, expect, it } from "vitest"

import { completeDraftPath, isDraftOnly } from "./drafts"
import { OfferProduct } from "./types"

const product = (overrides: Partial<OfferProduct>): OfferProduct =>
  ({ id: "prod_1", variants: [], offer_drafts: [], ...overrides }) as OfferProduct

describe("isDraftOnly", () => {
  it("is a row with open drafts and no offered variant", () => {
    expect(
      isDraftOnly(product({ offer_drafts: [{ id: "odraft_1", variant_id: null }] }))
    ).toBe(true)
  })

  it("is not a row that already sells a variant", () => {
    expect(
      isDraftOnly(
        product({
          variants: [{ id: "var_1", offers: [{ id: "offer_1" }] }] as OfferProduct["variants"],
          offer_drafts: [{ id: "odraft_1", variant_id: "var_2" }],
        })
      )
    ).toBe(false)
  })

  it("is not a row without drafts", () => {
    expect(isDraftOnly(product({}))).toBe(false)
  })
})

describe("completeDraftPath", () => {
  it("opens the create form on the drafted variant", () => {
    expect(
      completeDraftPath(product({ offer_drafts: [{ id: "odraft_1", variant_id: "var_1" }] }))
    ).toBe("create?product_id=prod_1&variant_id=var_1")
  })

  it("opens it on the whole product for a whole-product draft", () => {
    expect(
      completeDraftPath(product({ offer_drafts: [{ id: "odraft_1", variant_id: null }] }))
    ).toBe("create?product_id=prod_1")
  })

  it("leaves every variant when several are drafted", () => {
    expect(
      completeDraftPath(
        product({
          offer_drafts: [
            { id: "odraft_1", variant_id: "var_1" },
            { id: "odraft_2", variant_id: "var_2" },
          ],
        })
      )
    ).toBe("create?product_id=prod_1")
  })

  it("is null without a draft", () => {
    expect(completeDraftPath(product({}))).toBeNull()
  })
})
