import i18n from "i18next"
import { beforeAll, describe, expect, it, vi } from "vitest"

import en from "../translations/en.json"
import fa from "../translations/fa.json"
import { localizeApiMessage, translateApiError } from "../api-error-translator"

/**
 * Gate for «ارورهای فرم‌های vendor همگی ترجمه باشند».
 *
 * Every backend error the panel shows arrives as `error.message` in English and
 * is read by ~190 toast/form handlers. This table is the single place that
 * boundary is crossed, so a raw English string reaching the panel is a failure
 * of this file — hence a test rather than a review habit.
 */
beforeAll(async () => {
  await i18n.init({
    lng: "fa",
    fallbackLng: "en",
    resources: {
      fa: { translation: fa },
      en: { translation: en },
    },
    interpolation: { escapeValue: false },
  })
})

const isPersian = (value: string) => /[؀-ۿ]/.test(value)

describe("localizeApiMessage", () => {
  it("translates the standard HTTP statusText strings", () => {
    expect(isPersian(localizeApiMessage("Unauthorized"))).toBe(true)
    expect(isPersian(localizeApiMessage("Not Found"))).toBe(true)
    expect(isPersian(localizeApiMessage("Internal Server Error"))).toBe(true)
  })

  it("translates a parameterised backend message and keeps the detail", () => {
    const message = localizeApiMessage("Offer off_123 was not found")
    expect(isPersian(message)).toBe(true)
    expect(message).not.toContain("Offer off_123")
  })

  it("translates the zero-price rejection the offer grid can trigger", () => {
    // The backend rejects a non-positive offer amount; the producer must be
    // told what to fix, in their own language.
    const message = localizeApiMessage(
      "Invalid request body: amount: Number must be greater than 0",
      400
    )
    expect(isPersian(message)).toBe(true)
  })

  it("falls back to the status message for an unrecognised backend string", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const message = localizeApiMessage("Some brand new backend failure", 409)

    expect(isPersian(message)).toBe(true)
    expect(message).not.toContain("brand new")
    // The gap is still reported where support can see it.
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it("never returns English when there is no status either", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(isPersian(localizeApiMessage("Totally unknown"))).toBe(true)
    spy.mockRestore()
  })

  it("translates a network failure, which has no status at all", () => {
    expect(isPersian(localizeApiMessage("Failed to fetch"))).toBe(true)
  })
})

describe("translateApiError", () => {
  it("passes an already-localized message through untouched", () => {
    // The SDK transformer localizes on the way out; translating twice would
    // discard the specific message for a generic one.
    const localized = "این آفر دیگر وجود ندارد."
    expect(translateApiError(new Error(localized))).toBe(localized)
  })

  it("localizes a raw Error carrying an HTTP status", () => {
    const error = Object.assign(new Error("Nope"), { status: 403 })
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(isPersian(translateApiError(error))).toBe(true)
    spy.mockRestore()
  })

  it("has something to say about a thrown non-Error", () => {
    expect(isPersian(translateApiError(undefined))).toBe(true)
  })
})

/**
 * The sign-in flow's own errors.
 *
 * These are the messages a producer actually meets: a mistyped code, an expired
 * one, a number that is not registered. The backend answers them as CODES
 * (`INVALID_PHONE`) or as the OTP module's English sentences, and every one of
 * them used to fall through to the generic message for its HTTP status — so the
 * panel carried specific Persian copy for each and showed none of it, while
 * logging `[api-error] untranslated backend message` on each attempt.
 *
 * Asserted as a table because the failure mode is "somebody added a new code
 * and nobody noticed": each entry must come back Persian, and must not be the
 * status fallback.
 */
describe("phone sign-in errors reach the producer in their own words", () => {
  const genericFor = (status: number) =>
    localizeApiMessage("something nobody mapped", status)

  it.each([
    ["INVALID_PHONE", 400],
    ["INVALID_CODE", 400],
    ["PHONE_NOT_REGISTERED", 404],
    ["PHONE_ALREADY_REGISTERED", 422],
    ["Invalid verification code.", 401],
    ["Verification code has expired. Please request a new one.", 401],
    ["No active verification code. Please request a new one.", 401],
    ["Too many incorrect attempts. Please request a new code.", 400],
    ["Please wait before requesting another code.", 400],
  ])("translates %s", (message, status) => {
    const translated = localizeApiMessage(message, status)

    expect(isPersian(translated)).toBe(true)
    expect(translated).not.toBe(genericFor(status))
  })

  it("tells a wrong code apart from an expired one", () => {
    // Two different things to do about them — ask again vs. re-enter — so they
    // must not collapse into one sentence.
    expect(localizeApiMessage("Invalid verification code.", 401)).not.toBe(
      localizeApiMessage(
        "Verification code has expired. Please request a new one.",
        401
      )
    )
  })
})
