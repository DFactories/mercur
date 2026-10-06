import i18n from "i18next"

import { setClientErrorMessageTransformer } from "@mercurjs/client"

const ERROR_KEY = /^apiErrors\.[\w.]+$/

/**
 * Some refusals arrive as a translation key rather than an English sentence
 * (`apiErrors.product.axisInUse`), so the panel words them in its own
 * language. Every other message is left as the backend wrote it.
 */
export const localizeApiErrorKey = (message: string): string => {
  if (!ERROR_KEY.test(message)) {
    return message
  }

  const translated = i18n.t(message)
  return translated && translated !== message ? translated : message
}

export const installApiErrorKeyTranslator = () => {
  setClientErrorMessageTransformer((message) => localizeApiErrorKey(message))
}
