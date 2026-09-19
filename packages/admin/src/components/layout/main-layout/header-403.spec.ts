import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

/**
 * The sidebar header must not crash the panel on a 403.
 *
 * ## The bug
 *
 * Found by a user testing RBAC enforcement, not by a test. A newly created
 * admin had no role, `GET /admin/stores` returned 403, and this component's
 * bare `throw error` sent it to the error boundary — which replaces the WHOLE
 * panel, including the sign-out button and any page the operator is in fact
 * allowed to open. A restricted admin and a locked-out one looked identical:
 * a blank error page with nothing to act on.
 *
 * ## Why this is a source check rather than a render test
 *
 * This package has no DOM test setup, and adding @testing-library + jsdom to a
 * PUBLISHED package to assert one early-return is out of proportion. What
 * actually needs pinning is narrow and structural: that the throw is
 * conditional, and that 403 is the only status excused. A future edit back to
 * an unconditional `throw error` is the regression, and that is visible here.
 */
describe("the sidebar header on 403", () => {
  const source = readFileSync(join(__dirname, "main-layout.tsx"), "utf8")
  const header = source.slice(source.indexOf("const Header = ()"))
  const body = header.slice(0, header.indexOf("return ("))

  it("does not rethrow unconditionally", () => {
    // `if (isError) { throw error }` — the shape that took the panel down.
    expect(body).not.toMatch(/if\s*\(\s*isError\s*\)\s*\{\s*throw/)
  })

  it("excuses 403 and nothing else", () => {
    expect(body).toMatch(/403/)
    // Still throws for anything that is not a 403: swallowing a 500 would hide
    // a real fault behind the same grey placeholder.
    expect(body).toMatch(/throw error/)
    expect(body).toMatch(/status\s*!==\s*403/)
  })

  it("keeps the guard that disables the trigger when there is no store", () => {
    // Degrading is only safe because the trigger is already disabled without a
    // store. Remove that and a 403 renders a live dropdown over nothing.
    expect(body).toMatch(/isLoaded\s*=/)
    expect(source).toMatch(/disabled=\{!isLoaded\}/)
  })
})
