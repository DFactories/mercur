import { describe, expect, it } from "vitest"

import {
  findBlockingDraft,
  outcomeForKey,
  type OfferDraftRow,
} from "./offer-draft-rules"

const row = (overrides: Partial<OfferDraftRow> = {}): OfferDraftRow => ({
  id: "odraft_1",
  seller_id: "sel_1",
  product_id: "prod_1",
  variant_id: "var_1",
  external_id: "dfimport:k",
  status: "open",
  completed_offer_id: null,
  completed_at: null,
  created_by: null,
  metadata: null,
  created_at: "2026-10-04",
  updated_at: "2026-10-04",
  ...overrides,
})

const input = {
  seller_id: "sel_1",
  product_id: "prod_1",
  variant_id: "var_1" as string | null,
  external_id: "dfimport:k",
}

describe("outcomeForKey", () => {
  it("is free when nothing carries the key", () => {
    expect(outcomeForKey([], input)).toBeNull()
  })

  it("returns the variant's own draft, completed ones included", () => {
    const done = row({ status: "completed", completed_offer_id: "offer_1" })
    expect(outcomeForKey([done], input)).toEqual({ outcome: "existing", draft: done })
  })

  it("names a whole-product draft for variant null only", () => {
    const whole = row({ id: "odraft_w", variant_id: null })
    expect(outcomeForKey([whole], { ...input, variant_id: null })).toEqual({
      outcome: "existing",
      draft: whole,
    })
    expect(outcomeForKey([whole], input)).toBeNull()
  })

  it("leaves a new variant of the same product free", () => {
    expect(outcomeForKey([row()], { ...input, variant_id: "var_2" })).toBeNull()
  })

  it.each([
    ["another product", { product_id: "prod_2" }],
    ["another store", { seller_id: "sel_2" }],
  ])("refuses the key reused for %s, even on an unseen variant", (_label, change) => {
    expect(outcomeForKey([row()], { ...input, ...change, variant_id: "var_9" })).toEqual({
      outcome: "refused",
      error: expect.objectContaining({
        code: "external_id_conflict",
        draft_id: "odraft_1",
      }),
    })
  })
})

describe("findBlockingDraft", () => {
  it("blocks a second open draft on the same variant", () => {
    expect(findBlockingDraft([row()], "var_1")?.id).toBe("odraft_1")
  })

  it("lets drafts on other variants of the product coexist", () => {
    expect(findBlockingDraft([row()], "var_2")).toBeUndefined()
  })

  it("does not mix a whole-product draft with a variant draft, either way", () => {
    expect(findBlockingDraft([row()], null)?.id).toBe("odraft_1")
    expect(findBlockingDraft([row({ variant_id: null })], "var_2")).toBeDefined()
  })
})
