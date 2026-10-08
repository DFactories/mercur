import { describe, expect, it } from "vitest"

import {
  allCombinationsTaken,
  findVariantWithOptions,
} from "./taken-combination"

const variant = (id: string, options: Record<string, string>) => ({
  id,
  title: id,
  options: Object.entries(options).map(([title, value]) => ({
    value,
    option: { title },
  })),
})

const packaging = {
  name: "بسته بندی",
  values: [{ name: "کارتن 500 عددی" }],
}

describe("findVariantWithOptions", () => {
  it("finds the variant that already has the chosen values", () => {
    const existing = variant("v1", { "بسته بندی": "کارتن 500 عددی" })
    expect(
      findVariantWithOptions([existing], { "بسته بندی": "کارتن 500 عددی" }),
    ).toBe(existing)
  })

  it("lets a combination nobody has through", () => {
    const existing = variant("v1", { ضخامت: "45 میکرون", "بسته بندی": "کارتن 500 عددی" })
    expect(
      findVariantWithOptions([existing], {
        ضخامت: "45 میکرون",
        "بسته بندی": "کارتن 1000 عددی",
      }),
    ).toBeUndefined()
  })
})

describe("allCombinationsTaken", () => {
  it("is true when a one-value axis already has its variant", () => {
    expect(
      allCombinationsTaken(
        [packaging],
        [variant("v1", { "بسته بندی": "کارتن 500 عددی" })],
      ),
    ).toBe(true)
  })

  it("is false while a combination is still free", () => {
    expect(
      allCombinationsTaken(
        [{ ...packaging, values: [...packaging.values, { name: "کارتن 1000 عددی" }] }],
        [variant("v1", { "بسته بندی": "کارتن 500 عددی" })],
      ),
    ).toBe(false)
  })

  it("is false for a product with no variant axis", () => {
    expect(allCombinationsTaken([], [])).toBe(false)
  })
})
