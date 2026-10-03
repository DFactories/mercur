import { describe, expect, it } from "vitest";

import { includesVariant, readOfferCreatePrefill } from "./prefill";

const read = (query: string) => readOfferCreatePrefill(new URLSearchParams(query));

describe("readOfferCreatePrefill", () => {
  it("reads nothing from a plain create URL", () => {
    expect(read("")).toEqual({ productId: null, variantId: null });
  });

  it("reads the product and the variant", () => {
    expect(read("product_id=prod_1&variant_id=variant_1")).toEqual({
      productId: "prod_1",
      variantId: "variant_1",
    });
  });

  it("ignores a variant without its product", () => {
    expect(read("variant_id=variant_1")).toEqual({ productId: null, variantId: null });
  });

  it("treats blank values as absent", () => {
    expect(read("product_id=%20&variant_id=")).toEqual({ productId: null, variantId: null });
  });
});

describe("includesVariant", () => {
  const prefill = { productId: "prod_1", variantId: "variant_1" };

  it("keeps only the named variant of the prefilled product", () => {
    expect(includesVariant(prefill, "prod_1", "variant_1")).toBe(true);
    expect(includesVariant(prefill, "prod_1", "variant_2")).toBe(false);
  });

  it("keeps every variant of a product added by hand", () => {
    expect(includesVariant(prefill, "prod_2", "variant_9")).toBe(true);
  });

  it("keeps every variant when no variant was named", () => {
    expect(includesVariant({ productId: "prod_1", variantId: null }, "prod_1", "variant_2")).toBe(
      true,
    );
  });
});
