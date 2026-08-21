import i18n from "i18next"

import { setClientErrorMessageTransformer } from "@mercurjs/client"

/**
 * Panel-wide localization of backend (Medusa/Mercur) error messages.
 *
 * Every API error in the panel funnels through the @mercurjs/client SDK, which
 * builds a `ClientError` from the raw English backend string. We register a
 * single transformer there so toasts, form errors and anything else that reads
 * `error.message` show localized text — replacing the host-side DOM text-swap
 * overlay that only worked on the login screen.
 *
 * Maps known backend strings (standard HTTP statusText fallbacks + common app
 * messages) to i18n keys; unknown strings pass through untouched. Only active
 * while the panel language is Persian. Extend `API_ERROR_KEYS` as new strings
 * surface.
 */
const API_ERROR_KEYS: Record<string, string> = {
  // auth (reuse the login keys)
  "Invalid email or password": "login.errors.invalidCredentials",
  "Identity with email already exists": "login.errors.identityExists",
  // standard HTTP statusText fallbacks
  Unauthorized: "apiErrors.unauthorized",
  Forbidden: "apiErrors.forbidden",
  "Not Found": "apiErrors.notFound",
  "Bad Request": "apiErrors.badRequest",
  Conflict: "apiErrors.conflict",
  "Unprocessable Entity": "apiErrors.unprocessable",
  "Too Many Requests": "apiErrors.tooManyRequests",
  "Internal Server Error": "apiErrors.serverError",
  "Service Unavailable": "apiErrors.serviceUnavailable",
  "Request Timeout": "apiErrors.timeout",
}

export const installApiErrorTranslator = () => {
  setClientErrorMessageTransformer((message) => {
    if (!message || i18n.language !== "fa") {
      return message
    }
    const key = API_ERROR_KEYS[message.trim()]
    if (!key) {
      return message
    }
    const translated = i18n.t(key)
    return translated && translated !== key ? translated : message
  })
}
