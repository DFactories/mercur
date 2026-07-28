import { describe, expect, test } from "vitest"

import {
  getLocaleAmount,
  getNativeSymbol,
  getStylizedAmount,
} from "./money-amount-helpers"
import { formatTomanAmount, isTomanCurrency } from "./toman"

/**
 * Keep only the digits, folding Persian (U+06F0..) and Arabic-Indic (U+0660..)
 * numerals to ASCII — the panel formats in fa-IR, so the output is "۴۸۰٬۰۰۰"
 * and a plain `\d` filter would match nothing.
 */
const digits = (value: string) =>
  value
    .replace(/[۰-۹]/g, (d) =>
      String(d.charCodeAt(0) - 0x06f0)
    )
    .replace(/[٠-٩]/g, (d) =>
      String(d.charCodeAt(0) - 0x0660)
    )
    .replace(/[^0-9]/g, "")

describe("toman display", () => {
  test("recognises IRR regardless of case", () => {
    expect(isTomanCurrency("irr")).toBe(true)
    expect(isTomanCurrency("IRR")).toBe(true)
    expect(isTomanCurrency("usd")).toBe(false)
    expect(isTomanCurrency(null)).toBe(false)
    expect(isTomanCurrency(undefined)).toBe(false)
  })

  test("divides rial by ten and labels it toman", () => {
    const formatted = formatTomanAmount(4_800_000)

    expect(digits(formatted)).toBe("480000")
    expect(formatted).toContain("تومان")
  })

  test("never prints the IRR currency code", () => {
    // The order list read "IRR 4,800,000 IRR" — symbol and code both resolved
    // to the raw currency code, on top of the amount being in rial.
    for (const value of [
      getStylizedAmount(4_800_000, "irr"),
      getLocaleAmount(4_800_000, "irr"),
      getNativeSymbol("irr"),
    ]) {
      expect(value).not.toMatch(/IRR/i)
    }
  })

  test("every IRR entry point agrees on the amount", () => {
    expect(digits(getStylizedAmount(21_720_000, "irr"))).toBe("2172000")
    expect(digits(getLocaleAmount(21_720_000, "irr"))).toBe("2172000")
  })

  test("tolerates a missing amount instead of rendering NaN", () => {
    expect(digits(formatTomanAmount(Number.NaN))).toBe("0")
  })

  test("leaves non-IRR currencies on standard Intl formatting", () => {
    const usd = getStylizedAmount(10, "usd")

    expect(usd).toContain("USD")
    expect(usd).not.toContain("تومان")
  })
})
