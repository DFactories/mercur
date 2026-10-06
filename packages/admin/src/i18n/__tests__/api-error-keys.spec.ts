import i18n from "i18next"
import { beforeAll, describe, expect, it } from "vitest"

import fa from "../translations/fa.json"
import { localizeApiErrorKey } from "../api-error-keys"

beforeAll(async () => {
  await i18n.init({
    lng: "fa",
    fallbackLng: "fa",
    resources: { fa: { translation: fa } },
  })
})

describe("localizeApiErrorKey", () => {
  it("words a refusal sent as a translation key", () => {
    expect(localizeApiErrorKey("apiErrors.product.axisInUse")).toBe(
      fa.apiErrors.product.axisInUse,
    )
  })

  it("leaves an ordinary backend sentence alone", () => {
    expect(localizeApiErrorKey("Product not found")).toBe("Product not found")
  })

  it("keeps an unknown key rather than inventing words", () => {
    expect(localizeApiErrorKey("apiErrors.nope")).toBe("apiErrors.nope")
  })
})
