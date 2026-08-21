import { describe, expect, test } from "vitest"

import {
  PricingCreateSchema,
  PricingDetailsFields,
  PricingDetailsSchema,
  PricingPricesFields,
  PricingProductsFields,
} from "./schema"

/**
 * The create page used to land on the error boundary before rendering a single
 * field: `PricingDetailsSchema` picked `customer_group_ids`, a key that is not
 * on `PricingCreateSchema` (customer groups live under `rules.customer_group_id`).
 * zod 3 ignored an unknown key in `.pick()`; zod 4 throws `Unrecognized key`,
 * and it throws lazily from the `.shape` getter — so the crash surfaced at
 * module scope where `PricingDetailsFields` reads it.
 */
describe("price list create schema", () => {
  test("reading the tab field lists does not throw", () => {
    expect(() => PricingDetailsFields).not.toThrow()
    expect(() => Object.keys(PricingDetailsSchema.shape)).not.toThrow()
  })

  test("every picked key exists on the base schema", () => {
    const base = Object.keys(PricingCreateSchema.shape)

    for (const field of [
      ...PricingDetailsFields,
      ...PricingProductsFields,
      ...PricingPricesFields,
    ]) {
      expect(base).toContain(field)
    }
  })

  test("the details tab validates the fields it renders", () => {
    expect(PricingDetailsFields).toEqual(
      expect.arrayContaining([
        "type",
        "title",
        "description",
        "starts_at",
        "ends_at",
      ])
    )
  })

  test("customer groups are carried by rules, not a top-level key", () => {
    expect(Object.keys(PricingCreateSchema.shape)).toContain("rules")
    expect(Object.keys(PricingCreateSchema.shape)).not.toContain(
      "customer_group_ids"
    )
  })
})
