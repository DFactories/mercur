import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { needsStockLocation, STOCK_LOCATION_CREATE_PATH } from "./stock-location-notice"

describe("needsStockLocation", () => {
  it("asks for a location once the store is known to have none", () => {
    expect(needsStockLocation([], false)).toBe(true)
    expect(needsStockLocation(undefined, false)).toBe(true)
  })

  it("stays quiet while the list loads and when a location exists", () => {
    expect(needsStockLocation(undefined, true)).toBe(false)
    expect(needsStockLocation([{ id: "sloc_1" }], false)).toBe(false)
  })
})

describe("STOCK_LOCATION_CREATE_PATH", () => {
  it("is a route the panel defines", () => {
    // settings > locations > (list) > create, in the panel's own route map.
    const routes = readFileSync(
      fileURLToPath(new URL("../../../../get-route-map.tsx", import.meta.url)),
      "utf-8"
    )
    expect(STOCK_LOCATION_CREATE_PATH).toEqual("/settings/locations/create")
    expect(routes).toMatch(
      /path: "locations",[\s\S]*?path: "create",\s*lazy: \(\) => import\("\.\/pages\/settings\/locations\/create"\)/
    )
  })
})
