import { describe, expect, it } from "vitest";

import { isRowOffered, variantRowHasPrice, type OfferVariantRow } from "./schema";

const row = (prices: OfferVariantRow["prices"]): OfferVariantRow =>
  ({
    variant_id: "variant_1",
    product_id: "prod_1",
    product_title: "ظرف آلومینیوم",
    variant_title: "۵۰ میکرون",
    product_thumbnail: null,
    variant_sku: null,
    sku: "AL105-50",
    shipping_profile_id: "sp_1",
    prices,
    inventory: {},
  }) as OfferVariantRow;

/**
 * Guards the write side of a production incident: a producer priced one variant
 * of three, the other two rows submitted as `0`, and every product card in the
 * catalogue then printed «۰ تومان» because 0 wins every "cheapest offer"
 * comparison.
 */
describe("variantRowHasPrice", () => {
  it("rejects a blank price field", () => {
    expect(variantRowHasPrice(row({ irr: "" }), "irr")).toBe(false);
  });

  it("rejects an explicit zero", () => {
    expect(variantRowHasPrice(row({ irr: 0 }), "irr")).toBe(false);
  });

  it("rejects a missing entry for the store currency", () => {
    expect(variantRowHasPrice(row({}), "irr")).toBe(false);
    // A price in some other currency does not make the row sellable here.
    expect(variantRowHasPrice(row({ usd: 24 }), "irr")).toBe(false);
  });

  it("accepts a real amount", () => {
    expect(variantRowHasPrice(row({ irr: 55_000_000 }), "irr")).toBe(true);
  });
});

/**
 * A master product lists every variant any producer makes. Production,
 * 2026-10-08: a producer making two of five variants could not create an offer
 * because the form demanded a price, shipping and stock for all five.
 */
describe("isRowOffered", () => {
  it("sends a ticked row", () => {
    expect(isRowOffered({ ...row({}), include: true })).toBe(true);
  });

  it("skips a row the producer unticked", () => {
    expect(isRowOffered({ ...row({}), include: false })).toBe(false);
  });

  it("never opens a second offer on a variant the store already sells", () => {
    expect(
      isRowOffered({ ...row({}), include: true, already_offered: true }),
    ).toBe(false);
  });
});
