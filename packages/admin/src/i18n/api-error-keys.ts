import i18n from "i18next"

import { setClientErrorMessageTransformer } from "@mercurjs/client"

const ERROR_KEY = /^apiErrors\.[\w.]+$/

/**
 * Refusals an operator meets while approving a store's product change. They
 * carry a variant or a store name, so they are matched rather than keyed.
 */
const PATTERNS: { test: RegExp; key: string }[] = [
  {
    test: /^Cannot unassign option values .* using it: (.+)$/i,
    key: "apiErrors.product.optionValueInUse",
  },
  {
    test: /^Variant \((.+)\) with provided options already exists\.?$/i,
    key: "apiErrors.product.variantOptionsTaken",
  },
  {
    test: /^Variant "(.+)" is on sale by (.+)$/i,
    key: "apiErrors.product.variantOnSale",
  },
  { test: /^Product is on sale by (.+)$/i, key: "apiErrors.product.productOnSale" },
]

/**
 * Some refusals arrive as a translation key rather than an English sentence
 * (`apiErrors.product.axisInUse`), so the panel words them in its own
 * language. Every other message is left as the backend wrote it.
 */
export const localizeApiErrorKey = (message: string): string => {
  if (!ERROR_KEY.test(message)) {
    for (const { test, key } of PATTERNS) {
      const match = message.match(test)
      if (!match) continue
      const translated = i18n.t(key, {
        detail: match[1] ?? "",
        detail2: match[2] ?? "",
      })
      return translated && translated !== key ? translated : message
    }
    return message
  }

  const translated = i18n.t(message)
  return translated && translated !== message ? translated : message
}

export const installApiErrorKeyTranslator = () => {
  setClientErrorMessageTransformer((message) => localizeApiErrorKey(message))
}
