import { describe, expect, it, vi } from "vitest"

vi.mock("../../../components/utilities/i18n/i18n", () => ({
  i18n: { t: (key: string) => key },
}))

const { ProductCreateSchema } = await import("./constants")

/** The handle's issues alone; the rest of the form is not this test's business. */
const handleResult = (handle: string) => {
  const parsed = ProductCreateSchema.safeParse({ title: "t", handle, category_id: "pcat_1" })
  return {
    issues: (parsed.error?.issues ?? []).filter((i) => i.path[0] === "handle").map((i) => i.message),
  }
}

describe("create schema: handle", () => {
  it("shows the inline error for a Persian or malformed handle", () => {
    for (const handle of ["تست", "ab", "a--b", "-abc"]) {
      expect(handleResult(handle).issues).toEqual(["products.fields.handle.invalid"])
    }
  })

  it("accepts an empty handle (the backend fills it) and a Latin one after trim + lowercase", () => {
    expect(handleResult("").issues).toEqual([])
    expect(handleResult(" Container-703 ").issues).toEqual([])
  })
})
