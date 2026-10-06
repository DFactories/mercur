import { describe, expect, it } from "vitest"

import {
  normalizeMatchRecord,
  normalizeMatchText,
  sameMatchText,
} from "./normalize-match-text"
import { VendorAddProductVariant } from "../api/vendor/products/validators"
import { VendorCreateOffer } from "../api/vendor/offers/validators"
import { normalizeVariantOptions } from "../workflows/product-edit/steps/normalize-variant-options"

/**
 * The spellings found side by side on production on 2026-10-06, and the rules
 * the operator chose for them on 2026-10-07.
 */
describe("normalizeMatchText", () => {
  it("writes Persian and Arabic-Indic digits in Latin", () => {
    expect(normalizeMatchText("کارتن ۵۰۰ عددی")).toBe("کارتن 500 عددی")
    expect(normalizeMatchText("کارتن ٥٠٠ عددی")).toBe("کارتن 500 عددی")
    expect(normalizeMatchText("۱۲٫۵ گرم")).toBe("12.5 گرم")
  })

  it("writes Arabic ي ى ك as Persian ی ی ک", () => {
    expect(normalizeMatchText("كارتن يكبار مصرف")).toBe("کارتن یکبار مصرف")
    expect(normalizeMatchText("سى سى")).toBe("سی سی")
  })

  it("puts a space between a number and the Persian unit after it", () => {
    expect(normalizeMatchText("50میکرون")).toBe("50 میکرون")
    expect(normalizeMatchText("۵۰میکرون")).toBe("50 میکرون")
    expect(normalizeMatchText("50 میکرون")).toBe("50 میکرون")
  })

  it("leaves SKUs, Latin units and punctuation alone", () => {
    expect(normalizeMatchText("AL105-45")).toBe("AL105-45")
    expect(normalizeMatchText("50mm")).toBe("50mm")
    expect(normalizeMatchText("650+750 سی سی")).toBe("650+750 سی سی")
    expect(normalizeMatchText("20×30")).toBe("20×30")
  })

  it("is idempotent", () => {
    const once = normalizeMatchText("كارتن ۱۰۰۰عددی")
    expect(normalizeMatchText(once)).toBe(once)
  })

  it("treats the production duplicates as one value", () => {
    expect(sameMatchText("کارتن 500 عددی", "کارتن ۵۰۰ عددی")).toBe(true)
    expect(sameMatchText("50میکرون", "50 میکرون")).toBe(true)
    expect(sameMatchText("کارتن 500 عددی", "کارتن 1000 عددی")).toBe(false)
  })

  it("normalizes both sides of a variant's option map", () => {
    expect(normalizeMatchRecord({ "بسته بندي": "كارتن ۵۰۰ عددی" })).toEqual({
      "بسته بندی": "کارتن 500 عددی",
    })
  })
})

describe("matching fields arrive normalized through the validators", () => {
  it("a vendor variant's SKU and options", () => {
    const parsed = VendorAddProductVariant.parse({
      title: "کارتن ۵۰۰ — ۴۵ میکرون",
      sku: "AL۱۰۵-۴۵",
      options: { ضخامت: "۴۵میکرون", "بسته بندی": "کارتن ۵۰۰ عددی" },
    })
    expect(parsed.sku).toBe("AL105-45")
    expect(parsed.options).toEqual({
      ضخامت: "45 میکرون",
      "بسته بندی": "کارتن 500 عددی",
    })
    // The title is not a matching field: it keeps what was typed.
    expect(parsed.title).toBe("کارتن ۵۰۰ — ۴۵ میکرون")
  })

  it("an offer's SKU, so a duplicate is caught whichever keyboard typed it", () => {
    const parsed = VendorCreateOffer().parse({
      variant_id: "variant_1",
      sku: "AL۱۰۵-۴۵",
      ean: "۶۲۶۰۱۲۳۴۵۶۷۸۹",
      shipping_profile_id: "sp_1",
      inventory_items: [{ sku: "AL۱۰۵-۴۵", required_quantity: 1 }],
      prices: [{ amount: 1000, currency_code: "irr" }],
    })
    expect(parsed.sku).toBe("AL105-45")
    expect(parsed.ean).toBe("6260123456789")
    expect(parsed.inventory_items[0].sku).toBe("AL105-45")
  })
})

describe("normalizeVariantOptions against values saved before normalization", () => {
  const options = [
    {
      id: "pack",
      title: "بسته بندی",
      values: [{ id: "v500", value: "کارتن ۵۰۰ عددی" }],
      allowed_value_ids: ["v500"],
    },
  ]

  it("matches the Latin spelling and writes the product's own", () => {
    expect(
      normalizeVariantOptions(options as never, { "بسته بندی": "کارتن 500 عددی" })
    ).toEqual({ "بسته بندی": "کارتن ۵۰۰ عددی" })
  })

  it("still refuses a value the product does not have", () => {
    expect(() =>
      normalizeVariantOptions(options as never, { "بسته بندی": "کارتن 1000 عددی" })
    ).toThrow("apiErrors.product.optionValueMissing")
  })
})
