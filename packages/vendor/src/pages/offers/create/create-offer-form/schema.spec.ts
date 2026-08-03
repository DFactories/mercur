import { describe, expect, it } from "vitest";

import { variantRowHasPrice, type OfferVariantRow } from "./schema";

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
