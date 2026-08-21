import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * The create-fulfillment form's layout in RTL.
 *
 * Three physical CSS properties made this form lay out for LTR only. The panel
 * runs `dir="rtl"` by default, so they landed on the wrong edge every time:
 *
 *   - `mr-4` on the switch's control put the 16px gap on the switch's RIGHT.
 *     In RTL the label sits to the switch's LEFT, so the gap was on the outside
 *     and the label was flush against the control. Measured in the running
 *     panel: switch at 1015→1047 with marginRight 16px, and the label's right
 *     edge also at 1015 — a gap of exactly 0px between them, with the 16px
 *     stranded on the far side.
 *
 *   - `pl-2 pr-4` on the card around it. The intent is a tight edge on the
 *     switch side and a roomy one on the text side; in RTL the switch is on the
 *     right, so it got the roomy 16px and the text edge got the tight 8px —
 *     the intent exactly inverted. Measured: paddingLeft 8px, paddingRight 16px.
 *
 *   - `text-right` on the shipping-method loading label, which is wrong in LTR
 *     rather than RTL, and is simply `start` in both.
 *
 * The logical equivalents (`me-*`, `ps-*`/`pe-*`, `text-start`) resolve per
 * direction and are what the project's own UI rules require.
 */

const source = readFileSync(
  join(
    process.cwd(),
    "src/pages/orders/[id]/fulfillment/order-create-fulfillment-form/order-create-fulfillment-form.tsx"
  ),
  "utf8"
)

/** Class strings only — prose in comments explains these bugs by name. */
const stripComments = (input: string) =>
  input.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")

const code = stripComments(source)

describe("the form uses logical properties, so it mirrors in RTL", () => {
  it("spaces the switch from its label on the logical end", () => {
    expect(code).toContain('className="me-4 self-start"')
  })

  it("pads the notification card on logical edges", () => {
    expect(code).toContain("py-2 ps-2 pe-4")
  })

  it("aligns the loading label to the logical start", () => {
    expect(code).toContain('className="text-start"')
  })
})

describe("no physical inline-axis properties remain", () => {
  // The inline axis is the one that flips. `pt-*`/`pb-*`/`mt-*`/`mb-*` are
  // block-axis and identical in both directions, so they are not listed.
  it.each([
    ["margin-left", /\bml-\d/],
    ["margin-right", /\bmr-\d/],
    ["padding-left", /\bpl-\d/],
    ["padding-right", /\bpr-\d/],
    ["text-left", /\btext-left\b/],
    ["text-right", /\btext-right\b/],
    ["border-l", /\bborder-l\b/],
    ["border-r", /\bborder-r\b/],
  ])("uses no %s utility", (_label, pattern) => {
    expect(code).not.toMatch(pattern)
  })
})
