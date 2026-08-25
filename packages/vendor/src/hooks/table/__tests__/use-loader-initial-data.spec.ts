import { describe, expect, it } from "vitest"

import {
  isLoaderQueryPristine,
  loaderInitialData,
} from "../use-loader-initial-data"

/**
 * Regression cover for «فیلترها و پجینیشن کار نمی‌کند» on the vendor product
 * list.
 *
 * The route loader prefetches the first, unfiltered page and the table hands it
 * to react-query as `initialData`. `initialData` is keyed by QUERY KEY, so
 * seeding a filtered key with that unfiltered response tells react-query the
 * filtered query already holds fresh data — and the query client's 90s
 * `staleTime` then suppresses the fetch entirely. The chip appeared, the rows
 * never changed.
 */
describe("isLoaderQueryPristine", () => {
  it("is true when the URL carries no table state", () => {
    expect(
      isLoaderQueryPristine({ offset: undefined, q: undefined, status: undefined })
    ).toBe(true)
  })

  it("is false once a filter is applied, even on the first page", () => {
    // The exact production case: `offset` is absent because the shopper is on
    // page one, so the old `searchParams.offset ? undefined : loaderData` gate
    // let the unfiltered prefetch through.
    expect(
      isLoaderQueryPristine({ offset: undefined, status: "draft" })
    ).toBe(false)
  })

  it("is false while paging", () => {
    expect(isLoaderQueryPristine({ offset: "10" })).toBe(false)
  })

  it("is false once a sort is chosen", () => {
    expect(isLoaderQueryPristine({ order: "title" })).toBe(false)
  })

  it("treats an empty search term as real state", () => {
    // `?q=` is a search for the empty string, which is not what the loader ran.
    expect(isLoaderQueryPristine({ q: "" })).toBe(false)
  })

  it("survives a missing query object", () => {
    expect(
      isLoaderQueryPristine(undefined as unknown as Record<string, string>)
    ).toBe(true)
  })
})

describe("loaderInitialData", () => {
  const prefetch = { products: [{ id: "prod_1" }], count: 1 }

  it("seeds the pristine first page", () => {
    expect(loaderInitialData({ offset: undefined }, prefetch)).toBe(prefetch)
  })

  it("withholds the prefetch from every filtered or paged query", () => {
    expect(loaderInitialData({ status: "draft" }, prefetch)).toBeUndefined()
    expect(loaderInitialData({ offset: "10" }, prefetch)).toBeUndefined()
    expect(loaderInitialData({ q: "کارتن" }, prefetch)).toBeUndefined()
  })
})
