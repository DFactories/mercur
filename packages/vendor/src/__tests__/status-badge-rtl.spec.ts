import fs from "fs"
import path from "path"
import { createRequire } from "module"
import { describe, expect, test } from "vitest"

/**
 * The status badge, and the gap beside it, in RTL.
 *
 * `@medusajs/ui`'s StatusBadge pads itself `pl-0 pr-1` — PHYSICAL padding on a
 * flex row whose order follows `direction`. In RTL the dot moves to the right
 * and the label to the left while the 4px stays put, so the label sits flush
 * against its own border and the dot gains slack it never has in LTR. Every
 * status in this panel is that component. `src/index.css` restates the padding
 * logically, which is identical in LTR and correct in RTL.
 *
 * An override keyed on someone else's class names fails SILENTLY when they
 * change them — the selector simply stops matching and the badges quietly go
 * back to being wrong. So this asserts both halves: that the override is still
 * in the stylesheet we ship, and that upstream still emits the classes it is
 * keyed on. If Medusa UI ever fixes this itself, the second assertion fails and
 * tells us to delete the override rather than leaving two fixes stacked.
 */
const css = fs.readFileSync(path.join(__dirname, "..", "index.css"), "utf-8")

const upstreamStatusBadge = () => {
  const require = createRequire(import.meta.url)
  const entry = require.resolve("@medusajs/ui")
  // dist/esm/index.js -> dist/esm/components/status-badge/status-badge.js
  const source = path.join(
    path.dirname(entry),
    "components",
    "status-badge",
    "status-badge.js"
  )
  return fs.readFileSync(source, "utf-8")
}

describe("the RTL status-badge override still applies", () => {
  test("upstream still pads the badge with physical left/right classes", () => {
    // The reason the override exists. If this ever fails, upstream changed the
    // component: re-target the selector, or drop it.
    expect(upstreamStatusBadge()).toContain("pl-0 pr-1")
  })

  test("the shipped stylesheet restates that padding logically", () => {
    expect(css).toContain(
      "span.txt-compact-xsmall-plus.rounded-md.border.pl-0.pr-1"
    )
    expect(css).toContain("padding-inline-start: 0")
    expect(css).toContain("padding-inline-end: 0.25rem")
  })

  test("the padding is neutral in LTR — same 4px, same side", () => {
    // `inline-end` resolves to `right` in LTR, which is what `pr-1` was; the
    // rule must not introduce a second value that would change LTR spacing.
    const rule = css.slice(
      css.indexOf("span.txt-compact-xsmall-plus.rounded-md.border.pl-0.pr-1")
    )
    const block = rule.slice(rule.indexOf("{"), rule.indexOf("}"))
    expect(block).toContain("padding-left: 0")
    expect(block).toContain("padding-right: 0")
    expect(block).not.toMatch(/padding-inline-start:\s*0\.25rem/)
  })

  test("space-x-* gaps are flipped for RTL rather than collapsing", () => {
    expect(css).toContain('[dir="rtl"] [class*="space-x-"]')
    expect(css).toContain("--tw-space-x-reverse: 1")
  })
})
