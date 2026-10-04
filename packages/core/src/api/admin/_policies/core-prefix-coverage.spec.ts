import { describe, expect, it } from "vitest"

import { OVERRIDES } from "../../../utils/disable-medusa-middlewares"
import { CORE_RESOURCE_PREFIXES } from "./resources"

// Disabling a Medusa admin middleware file drops Medusa's policy guards with
// it, so every admin group in OVERRIDES must be guarded again here.
const disabledAdminPrefixes = OVERRIDES.map((file) =>
  file.match(/^dist\/api\/admin\/([^/]+)\/middlewares\.js$/)
)
  .filter((match): match is RegExpMatchArray => !!match)
  .map((match) => `/admin/${match[1]}`)

describe("core admin prefixes", () => {
  it("finds the disabled admin groups (guards the test itself)", () => {
    expect(disabledAdminPrefixes.length).toBeGreaterThan(10)
  })

  it("guards every admin group whose Medusa middlewares are disabled", () => {
    const guarded = new Set(Object.values(CORE_RESOURCE_PREFIXES))
    expect(disabledAdminPrefixes.filter((prefix) => !guarded.has(prefix))).toEqual([])
  })

  it("guards nothing that Medusa still guards itself", () => {
    const disabled = new Set(disabledAdminPrefixes)
    expect(
      Object.values(CORE_RESOURCE_PREFIXES).filter((prefix) => !disabled.has(prefix))
    ).toEqual([])
  })
})
