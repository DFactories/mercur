import fs from "fs"
import path from "path"
import { describe, expect, it } from "vitest"

import {
  canSubmitForReview,
  isQueuedForReview,
  PENDING_PRODUCT_CHANGE_ERROR_MESSAGE,
} from "../product-change"

describe("isQueuedForReview", () => {
  it("is true only when the server queued the change for an operator", () => {
    expect(isQueuedForReview({ product_change: { status: "pending" } })).toBe(
      true
    )
  })

  it("is false for a change applied on the spot — an unpublished product's edit", () => {
    // Deciding this from the PRODUCT_REQUEST flag told a producer editing a
    // draft that the change awaited approval when it was already applied.
    expect(isQueuedForReview({ product_change: { status: "confirmed" } })).toBe(
      false
    )
  })

  it("is false when there is no change to read", () => {
    expect(isQueuedForReview(undefined)).toBe(false)
    expect(isQueuedForReview({ product_change: null })).toBe(false)
  })
})

describe("the pending-request refusal", () => {
  it("is the exact sentence the backend sends", () => {
    // The panel recognises the refusal by its text (the SDK keeps only the
    // message), so a wording change on one side must fail here, not in a
    // producer's toast.
    const coreStep = path.resolve(
      __dirname,
      "../../../../core/src/workflows/product-edit/steps/validate-no-pending-product-change.ts"
    )
    expect(fs.readFileSync(coreStep, "utf-8")).toContain(
      `"${PENDING_PRODUCT_CHANGE_ERROR_MESSAGE}"`
    )
  })
})

describe("canSubmitForReview", () => {
  it("offers review for a product never submitted or sent back", () => {
    expect(canSubmitForReview("draft")).toBe(true)
    expect(canSubmitForReview("rejected")).toBe(true)
  })

  it("does not offer it once the product is waiting or live", () => {
    expect(canSubmitForReview("proposed")).toBe(false)
    expect(canSubmitForReview("published")).toBe(false)
    expect(canSubmitForReview(undefined)).toBe(false)
  })
})
