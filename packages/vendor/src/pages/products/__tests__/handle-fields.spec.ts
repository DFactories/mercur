import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Where the product handle lives in the producer panel (owner decisions 165,
 * 194): asked on the Organize tab under the category it is suggested from,
 * Latin and left-to-right, and read-only once the product exists. The panel
 * has no DOM test environment, so the markup is checked in the source.
 */
const read = (path: string) =>
  readFileSync(join(process.cwd(), "src/pages/products", path), "utf8")

const ORGANIZE = read(
  "create/components/product-create-organize-form/components/product-create-organize-section/product-create-details-organize-section.tsx"
)
const GENERAL = read(
  "create/components/product-create-details-form/components/product-create-details-general-section/product-create-general-section.tsx"
)
const EDIT = read("[id]/edit/edit-product-form/edit-product-form.tsx")

describe("create form", () => {
  it("asks the handle on the Organize tab, after the category", () => {
    expect(GENERAL).not.toContain('name="handle"')
    expect(ORGANIZE.indexOf('name="handle"')).toBeGreaterThan(ORGANIZE.indexOf('name="category_id"'))
    expect(read("create/components/product-create-details-form/product-create-details-form.tsx")).toContain(
      'validationFields: ["title", "description", "media"]'
    )
    expect(read("create/components/product-create-organize-form/product-create-organize-form.tsx")).toMatch(
      /validationFields: \[[^\]]*"handle"/
    )
  })

  it("wraps the control in an LTR box, never inside it, and shows its error", () => {
    const field = ORGANIZE.slice(ORGANIZE.indexOf('name="handle"'))
    expect(field).toMatch(/<div dir="ltr">\s*<Form\.Control[^>]*>\s*<HandleInput/)
    expect(field).toContain("<Form.Hint>")
    expect(field).toContain("<Form.ErrorMessage />")
  })

  it("shows the title template hint below the title row", () => {
    expect(GENERAL).toContain('t("products.fields.title.templateHint")')
    expect(GENERAL).toContain("md:grid-cols-2")
  })
})

describe("edit form", () => {
  it("shows the handle read-only and never sends it", () => {
    const field = EDIT.slice(EDIT.indexOf('name="handle"'))
    expect(field).toMatch(/<div dir="ltr">\s*<Form\.Control>\s*<Input \{\.\.\.field\} disabled readOnly \/>/)
    expect(field).toContain('t("products.fields.handle.lockedHint")')
    const payload = EDIT.slice(EDIT.indexOf("const payload"), EDIT.indexOf("await mutateAsync"))
    expect(payload).not.toMatch(/\bhandle\b/)
  })

  it("has no physical left/right classes left on the handle", () => {
    expect(EDIT).not.toMatch(/\b(left-0|border-r|pl-10)\b/)
  })
})
