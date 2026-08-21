import { describe, expect, test } from "vitest"

import {
  SELECTABLE_COUNTRY_ISO2,
  countries,
  getCountryByIso2,
  selectableCountries,
} from "./countries"

/**
 * Country fields used to open on the full world list because `CountrySelect`
 * accepted a `defaultValue` no call site passed. The choice is now made once,
 * here, so a new form inherits it instead of reopening the list.
 */
describe("selectable countries", () => {
  test("offers Iran and nothing else", () => {
    expect(selectableCountries.map((c) => c.iso_2)).toEqual(["ir"])
  })

  test("stays in step with the iso list it is derived from", () => {
    expect(selectableCountries).toHaveLength(SELECTABLE_COUNTRY_ISO2.length)
  })

  test("keeps the full list for resolving historical values", () => {
    // Narrowing `countries` itself would render an older record's country as
    // blank rather than by name.
    expect(countries.length).toBeGreaterThan(selectableCountries.length)
    expect(getCountryByIso2("us")?.display_name).toBe("United States")
    expect(getCountryByIso2("IR")?.iso_2).toBe("ir")
  })
})
