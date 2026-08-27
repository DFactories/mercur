import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

/**
 * Every address a seller edits must pick its province and city from the
 * geography catalog.
 *
 * The seller→province/city links every regional report counts from are matched
 * BY NAME against that catalog, and shipping here is priced city to city. A
 * free-text field does not merely look untidy: «استان تهران» instead of
 * «تهران», or a typo, leaves the address unmatchable and the store uncounted.
 *
 * SOURCE ASSERTIONS, because this fork merges upstream regularly and upstream's
 * forms are free text. A rebase that quietly restores `<Input>` on these fields
 * would pass every other check — the panel would build, the form would submit,
 * and the damage would only surface later as a store missing from a report.
 * `country-states.ts`, which the generic `ProvinceSelect` reads, has no IR
 * entry at all, so there is no upstream control that would do instead.
 */

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8")

const FORMS = {
  "store address":
    "store/address/store-address-form.tsx",
  "location (create)":
    "locations/create/_components/create-location-form.tsx",
  "location (edit)":
    "locations/[location_id]/edit/_components/edit-location-form.tsx",
} as const

/** The block of JSX for one `Form.Field`, by field name. */
const fieldBlock = (source: string, name: string) => {
  const start = source.indexOf(`name="${name}"`)
  expect(start).toBeGreaterThan(-1)
  const next = source.indexOf("<Form.Field", start)
  return source.slice(start, next === -1 ? undefined : next)
}

describe.each(Object.entries(FORMS))("%s", (_label, path) => {
  const source = read(path)
  const province = path.includes("locations") ? "address.province" : "province"
  const city = path.includes("locations") ? "address.city" : "city"

  it("reads the province from the geography catalog, not a text box", () => {
    const block = fieldBlock(source, province)

    expect(block).toContain("GeoProvinceSelect")
    expect(block).not.toContain("<Input")
  })

  it("reads the city from the geography catalog, not a text box", () => {
    const block = fieldBlock(source, city)

    expect(block).toContain("GeoCitySelect")
    expect(block).not.toContain("<Input")
  })

  it("asks for the province first and gates the city on it", () => {
    // A city name is not unique across provinces, so the pair only resolves in
    // that order — an ungated city list would offer every city in the country.
    expect(source.indexOf(`name="${province}"`)).toBeLessThan(
      source.indexOf(`name="${city}"`)
    )
    expect(fieldBlock(source, city)).toContain("disabled={!selectedProvince}")
  })

  it("clears the city when the province changes", () => {
    // The old city belongs to the old province; keeping it would save a pair
    // that resolves to nothing at all.
    const block = fieldBlock(source, province)

    expect(block).toMatch(
      new RegExp(`setValue\\(\\s*"${city.replace(".", "\\.")}",\\s*""`)
    )
  })

  it("labels both fields from the geography namespace", () => {
    expect(fieldBlock(source, province)).toContain("geography.province")
    expect(fieldBlock(source, city)).toContain("geography.city")
  })
})
