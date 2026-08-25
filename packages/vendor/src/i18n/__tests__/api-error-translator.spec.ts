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
