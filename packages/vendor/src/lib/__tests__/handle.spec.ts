import { describe, expect, it } from "vitest"

import { isValidHandle, isValidLatinProductHandle } from "../handle"

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

describe("isValidLatinProductHandle", () => {
  it("accepts a Latin keyword handle", () => {
    expect(isValidLatinProductHandle("container-703")).toBe(true)
    expect(isValidLatinProductHandle("compartment-containers-3-compartment-microwave-703")).toBe(true)
    expect(isValidLatinProductHandle("a".repeat(60))).toBe(true)
  })

  it("rejects uppercase, Persian, stray hyphens and the wrong length", () => {
    expect(isValidLatinProductHandle("Abc")).toBe(false)
    expect(isValidLatinProductHandle("ظرف")).toBe(false)
    expect(isValidLatinProductHandle("a")).toBe(false)
    expect(isValidLatinProductHandle("-a")).toBe(false)
    expect(isValidLatinProductHandle("a--b")).toBe(false)
    expect(isValidLatinProductHandle("a".repeat(61))).toBe(false)
  })

  it("leaves store handles Persian-capable", () => {
    expect(isValidHandle("ظرف-تست")).toBe(true)
  })
})
