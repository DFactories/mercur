import { describe, expect, it } from "vitest"

import { isValidHandle } from "../handle"

describe("isValidHandle", () => {
  it("accepts the Persian handles the server generates from a Persian name", () => {
    // `toHandle("فروشگاه من")` → "فروشگاه-من"; rejecting this is what made the
    // store edit form unsubmittable.
    expect(isValidHandle("فروشگاه-من")).toBe(true)
    expect(isValidHandle("کتاب-فارسی")).toBe(true)
    expect(isValidHandle("ترابرنت")).toBe(true)
    expect(isValidHandle("فروشگاه-۱")).toBe(true)
  })

  it("accepts latin handles", () => {
    expect(isValidHandle("my-store-123")).toBe(true)
    expect(isValidHandle("store")).toBe(true)
  })

  it("rejects uppercase, spaces, and stray hyphens", () => {
    expect(isValidHandle("Hello-World")).toBe(false)
    expect(isValidHandle("my store")).toBe(false)
    expect(isValidHandle("-store")).toBe(false)
    expect(isValidHandle("store-")).toBe(false)
    expect(isValidHandle("my--store")).toBe(false)
    expect(isValidHandle("")).toBe(false)
  })
})
