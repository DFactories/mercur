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

  it("names the store whose offer blocks a variant removal", () => {
    expect(
      localizeApiErrorKey('Variant "45 میکرون" is on sale by آلومینیوم دلفان'),
    ).toBe(
      fa.apiErrors.product.variantOnSale
        .replace("{{detail}}", "45 میکرون")
        .replace("{{detail2}}", "آلومینیوم دلفان"),
    )
  })

  it("words Medusa's refusal to drop an option value a variant uses", () => {
    expect(
      localizeApiErrorKey(
        "Cannot unassign option values from product because the following variant(s) are using it: 45 میکرون, 50 میکرون",
      ),
    ).toBe(
      fa.apiErrors.product.optionValueInUse.replace(
        "{{detail}}",
        "45 میکرون, 50 میکرون",
      ),
    )
  })

  it("keeps an unknown key rather than inventing words", () => {
    expect(localizeApiErrorKey("apiErrors.nope")).toBe("apiErrors.nope")
  })
})
