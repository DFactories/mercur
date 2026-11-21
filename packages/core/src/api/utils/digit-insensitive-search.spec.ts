import { describe, expect, it, vi } from "vitest"

import { applyDigitInsensitiveSearch } from "./digit-insensitive-search"

/**
 * A product search finds the same products whichever keyboard typed it.
 *
 * Titles keep what was typed, and Postgres `ILIKE` folds neither digits nor
 * letters: `'کیسه زباله' ILIKE '%كيسه%'` is false. An Arabic keyboard, the
 * default on many phones, types ي and ك where a Persian one types ی and ک, so
 * a producer searching their own list for «كيسه» was shown nothing.
 */

const invoke = async (q: unknown, found: Record<string, string[]> = {}) => {
  const searched: string[] = []
  const graph = vi.fn(async ({ filters }: { filters: { q: string } }) => {
    searched.push(filters.q)
    return { data: (found[filters.q] ?? []).map((id) => ({ id })) }
  })
  const req = {
    filterableFields: { q } as Record<string, unknown>,
    scope: { resolve: () => ({ graph }) },
  }
  const next = vi.fn()

  await applyDigitInsensitiveSearch(req as never, {} as never, next)

  expect(next).toHaveBeenCalledTimes(1)
  return { searched, filters: req.filterableFields }
}

describe("applyDigitInsensitiveSearch", () => {
  it("searches a word typed on an Arabic keyboard in the Persian spelling too", async () => {
    const { searched, filters } = await invoke("كيسه", { کیسه: ["prod_1"] })

    expect(searched.sort()).toEqual(["كيسه", "کیسه"].sort())
    expect(filters.q).toBeUndefined()
    expect(filters.$and).toEqual([{ id: ["prod_1"] }])
  })

  it("searches a word typed on a Persian keyboard in the Arabic spelling too", async () => {
    const { searched, filters } = await invoke("کیسه", { كيسه: ["prod_2"] })

    expect(searched.sort()).toEqual(["كيسه", "کیسه"].sort())
    expect(filters.$and).toEqual([{ id: ["prod_2"] }])
  })

  it("combines both digit spellings with both letter spellings", async () => {
    const { searched } = await invoke("کد ۲")

    expect(searched.sort()).toEqual(["كد 2", "كد ۲", "کد 2", "کد ۲"].sort())
  })

  it("still searches a number in both digit spellings", async () => {
    const { searched, filters } = await invoke("105", { "۱۰۵": ["prod_3"] })

    expect(searched.sort()).toEqual(["105", "۱۰۵"].sort())
    expect(filters.$and).toEqual([{ id: ["prod_3"] }])
  })

  it("matches nothing when no spelling finds a product", async () => {
    const { filters } = await invoke("كيسه")

    expect(filters.$and).toEqual([{ id: ["__none__"] }])
  })

  it("leaves a query with one spelling to Medusa", async () => {
    const { searched, filters } = await invoke("زباله")

    expect(searched).toEqual([])
    expect(filters).toEqual({ q: "زباله" })
  })
})
