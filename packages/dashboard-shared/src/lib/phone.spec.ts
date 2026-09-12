import { describe, expect, it } from "vitest"

import {
  IRAN_MOBILE_RE,
  iranMobileSchema,
  isIranMobile,
  normalizeIranPhone,
  optionalIranMobileSchema,
} from "./phone"

/**
 * The panel-side guard on a sign-in number.
 *
 * Two separate defects live here, and both shipped:
 *   1. a landline was accepted by every phone field in the panels, and the
 *      account it created could never be opened — the code goes to a number
 *      that does not ring;
 *   2. the four hand-rolled normalizers this file replaces all ignored Persian
 *      digits, so the keyboard most of our producers actually use produced a
 *      number their own form called invalid.
 */
describe("normalizeIranPhone", () => {
  it("reduces every accepted spelling to one form", () => {
    for (const input of [
      "09121234567",
      " 0912 123 4567 ",
      "0912-123-4567",
      "+989121234567",
      "00989121234567",
      "989121234567",
      "9121234567",
      "۰۹۱۲۱۲۳۴۵۶۷",
      "٠٩١٢١٢٣٤٥٦٧",
    ]) {
      expect(normalizeIranPhone(input.trim())).toBe("09121234567")
    }
  })
})

describe("isIranMobile", () => {
  it("refuses the landline that started this", () => {
    expect(isIranMobile("02112345678")).toBe(false)
    expect(isIranMobile("۰۲۱۱۲۳۴۵۶۷۸")).toBe(false)
  })

  it("refuses anything that is not 09 + 9 digits", () => {
    expect(isIranMobile("0912123456")).toBe(false)
    expect(isIranMobile("091212345678")).toBe(false)
    expect(isIranMobile("")).toBe(false)
    expect(isIranMobile(undefined)).toBe(false)
  })

  it("matches the backend's regex exactly", () => {
    // Same source of truth as @mercurjs/core's `IRAN_MOBILE_RE`; a drift here
    // means a form that accepts what the API then rejects.
    expect(IRAN_MOBILE_RE.source).toBe("^09\\d{9}$")
  })
})

describe("iranMobileSchema", () => {
  const schema = iranMobileSchema("bad phone")

  it("submits the canonical form whatever was typed", () => {
    expect(schema.parse("۰۹۱۲۱۲۳۴۵۶۷")).toBe("09121234567")
    expect(schema.parse(" +98 912 123 4567 ")).toBe("09121234567")
  })

  it("reports the caller's message for a landline", () => {
    const result = schema.safeParse("02112345678")
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe("bad phone")
  })

  it("does not accept an empty field", () => {
    expect(schema.safeParse("").success).toBe(false)
  })

  it("tells an empty field it is missing, not that it is wrong", () => {
    const withRequired = iranMobileSchema("bad phone", "phone required")
    expect(withRequired.safeParse("").error?.issues[0].message).toBe(
      "phone required"
    )
    expect(withRequired.safeParse("02112345678").error?.issues[0].message).toBe(
      "bad phone"
    )
  })
})

describe("optionalIranMobileSchema", () => {
  const schema = optionalIranMobileSchema("bad phone")

  it("accepts an empty field", () => {
    expect(schema.parse("")).toBe("")
    expect(schema.parse("   ")).toBe("")
  })

  it("still refuses a number that cannot receive a code", () => {
    expect(schema.safeParse("02112345678").success).toBe(false)
    expect(schema.parse("۰۹۱۲۱۲۳۴۵۶۷")).toBe("09121234567")
  })
})
