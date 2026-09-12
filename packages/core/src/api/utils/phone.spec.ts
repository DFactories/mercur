import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  assertIranMobile,
  iranMobileField,
  iranMobileVariants,
  isIranMobile,
  normalizeIranPhone,
  optionalIranMobileField,
  toLatinDigits,
} from "./phone"

/**
 * Production, 2026-09: a producer registered with a landline. The form took it,
 * the account was created, the OTP went to a number that cannot receive SMS —
 * and they were locked out of an account that was already theirs. The same hole
 * existed on every other write of a sign-in number: the store phone in
 * onboarding, the store phone in settings, and both member invites (a landline
 * there invites someone who can never accept).
 *
 * The guard lives here, once, and the routes' validators call it.
 */
describe("normalizeIranPhone", () => {
  it("accepts every common spelling of the same mobile", () => {
    for (const input of [
      "09121234567",
      "0912 123 4567",
      "0912-123-4567",
      "+989121234567",
      "00989121234567",
      "989121234567",
      // The leading zero is the digit people drop when dictating a number.
      "9121234567",
    ]) {
      expect(normalizeIranPhone(input)).toBe("09121234567")
    }
  })

  it("reads Persian and Arabic-Indic digits as the same number", () => {
    // What the default keyboard on an Iranian phone actually produces.
    expect(normalizeIranPhone("۰۹۱۲۱۲۳۴۵۶۷")).toBe("09121234567")
    expect(normalizeIranPhone("٠٩١٢١٢٣٤٥٦٧")).toBe("09121234567")
    expect(toLatinDigits("۰۹٣")).toBe("093")
  })
})

describe("isIranMobile", () => {
  it("refuses a landline — the number the OTP can never reach", () => {
    // Tehran, Mashhad, Isfahan: 11 digits, starts with 0, and is not a mobile.
    expect(isIranMobile("02112345678")).toBe(false)
    expect(isIranMobile("05138123456")).toBe(false)
    expect(isIranMobile("۰۲۱۱۲۳۴۵۶۷۸")).toBe(false)
  })

  it("refuses anything that is not 09 + 9 digits", () => {
    expect(isIranMobile("0912123456")).toBe(false) // one short
    expect(isIranMobile("091212345678")).toBe(false) // one long
    expect(isIranMobile("08121234567")).toBe(false) // wrong prefix
    expect(isIranMobile("phone")).toBe(false)
    expect(isIranMobile("")).toBe(false)
    expect(isIranMobile(null)).toBe(false)
    expect(isIranMobile(undefined)).toBe(false)
  })

  it("accepts a mobile on every operator prefix", () => {
    for (const prefix of ["090", "091", "092", "093", "099"]) {
      expect(isIranMobile(`${prefix}12345678`)).toBe(true)
    }
  })
})

describe("assertIranMobile", () => {
  it("returns the canonical form", () => {
    expect(assertIranMobile("+98 912 123 4567")).toBe("09121234567")
  })

  it("throws INVALID_PHONE, the code every client maps to its own copy", () => {
    expect(() => assertIranMobile("02112345678")).toThrow("INVALID_PHONE")
  })
})

describe("iranMobileVariants", () => {
  it("covers the formats rows were written in before normalization", () => {
    expect(iranMobileVariants("+989121234567")).toEqual(
      expect.arrayContaining([
        "09121234567",
        "9121234567",
        "989121234567",
        "+989121234567",
        "00989121234567",
      ])
    )
  })
})

describe("iranMobileField", () => {
  it("normalizes as it validates, so what is stored is canonical", () => {
    expect(iranMobileField().parse("۰۹۱۲۱۲۳۴۵۶۷")).toBe("09121234567")
    expect(iranMobileField().parse("+98 912 123 4567")).toBe("09121234567")
  })

  it("refuses a landline", () => {
    expect(() => iranMobileField().parse("02112345678")).toThrow()
  })
})

describe("optionalIranMobileField", () => {
  it("treats null and empty as clearing the number", () => {
    expect(optionalIranMobileField().parse(null)).toBeNull()
    expect(optionalIranMobileField().parse("   ")).toBeNull()
  })

  it("leaves an absent field absent — it must not read as 'clear it'", () => {
    // These validate PATCH-shaped bodies. Folding `undefined` to `null` would
    // make every seller update that does not mention the phone (a closure
    // window, a status change, a premium toggle) erase the store's number and
    // its SMS verification along with it.
    const body = z
      .object({ name: z.string().optional(), phone: optionalIranMobileField() })
      .parse({ name: "Store" })

    expect("phone" in body).toBe(false)
    expect({ ...body }).toEqual({ name: "Store" })
  })

  it("still refuses a bad number when one is given", () => {
    expect(optionalIranMobileField().parse("۰۹۱۲۱۲۳۴۵۶۷")).toBe("09121234567")
    expect(() => optionalIranMobileField().parse("02112345678")).toThrow()
  })
})
