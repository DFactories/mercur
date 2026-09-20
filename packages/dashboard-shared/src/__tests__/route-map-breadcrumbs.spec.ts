import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

/**
 * Every route-map breadcrumb goes through `t()`.
 *
 * Both panels declare their breadcrumbs in `get-route-map.tsx`, where `t` is
 * imported from i18next, and every route used it — except `/payouts`, which
 * returned the literal `"Payouts"` in both files. So a Persian operator on the
 * payouts page saw an English breadcrumb, in both the admin and the vendor
 * panel, while `payouts.domain` ("پرداخت‌ها" / "تسویه‌ها") sat unused in the
 * locale files.
 *
 * One literal is all it takes, so this asserts there are none.
 */
const ROOT = join(__dirname, "..", "..", "..", "..")

const ROUTE_MAPS = [
  "packages/admin/src/get-route-map.tsx",
  "packages/vendor/src/get-route-map.tsx",
]

describe("route-map breadcrumbs", () => {
  it("finds the route maps (guards the test itself)", () => {
    const found = ROUTE_MAPS.filter((p) => existsSync(join(ROOT, p)))
    expect(found).toEqual(ROUTE_MAPS)
  })

  it("flags a literal breadcrumb (guards the test itself)", () => {
    const LITERAL = /breadcrumb:\s*\(\s*\)\s*=>\s*["'`]/
    expect(LITERAL.test('breadcrumb: () => "Payouts",')).toBe(true)
    expect(LITERAL.test('breadcrumb: () => t("payouts.domain"),')).toBe(false)
  })

  it.each(ROUTE_MAPS)("%s returns no literal breadcrumb", (rel) => {
    const LITERAL = /breadcrumb:\s*\(\s*\)\s*=>\s*["'`]/
    const offenders = readFileSync(join(ROOT, rel), "utf8")
      .split("\n")
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => LITERAL.test(line))
      .map(({ line, n }) => `${rel}:${n}  ${line}`)

    expect(offenders).toEqual([])
  })
})
