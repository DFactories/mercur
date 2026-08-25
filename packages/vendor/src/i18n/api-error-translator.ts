import i18n from "i18next"

import { setClientErrorMessageTransformer } from "@mercurjs/client"

/**
 * Panel-wide localization of backend (Medusa/Mercur) error messages.
 *
 * Every API error the panel raises reaches the UI as `error.message` — read by
 * ~190 `toast.error` call sites and by form-level error handlers — and the
 * backend writes those in English. Translating at the call sites would mean
 * touching each one and would still miss the next one written; the SDK builds
 * every `ClientError` through one transformer, so that is where the language
 * boundary belongs.
 *
 * Three tiers, most specific first:
 *
 * 1. `EXACT` — whole backend strings that never vary.
 * 2. `PATTERNS` — backend strings carrying an id or a name. The captured group
 *    is passed to the key so the vendor keeps the detail (which SKU, which
 *    variant) in their own language.
 * 3. Status fallback — anything unrecognised becomes the translated message for
 *    its HTTP status, so no English ever reaches the panel. The raw string is
 *    logged to the console: the vendor should not read it, but support must be
 *    able to.
 *
 * Language-agnostic on purpose: i18next resolves the active language and falls
 * back to `en` for a missing key, so this works for every locale the panel
 * ships rather than only Persian.
 */

const EXACT: Record<string, string> = {
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
  // network layer — thrown by fetch itself, never by the backend
  "Failed to fetch": "apiErrors.network",
  "Load failed": "apiErrors.network",
  "Network request failed": "apiErrors.network",
}

/**
 * Ordered: the first pattern that matches wins, so put narrow rules above broad
 * ones. `detail` is whatever the capture group holds — an id, a SKU, a field
 * name — and is interpolated into the key.
 */
const PATTERNS: { test: RegExp; key: string }[] = [
  // offers
  { test: /^Offer (.+) was not found$/i, key: "apiErrors.offerNotFound" },
  { test: /^Variant (.+) has no PriceSet$/i, key: "apiErrors.variantNoPriceSet" },
  {
    test: /price .* does not belong to offer (.+)/i,
    key: "apiErrors.priceNotOwned",
  },
  { test: /Offer must have at least one inventory item/i, key: "apiErrors.offerNeedsInventory" },
  // validation — zod/Medusa body validation, e.g.
  // "Invalid request body: amount: Number must be greater than 0"
  { test: /^Invalid request(?: body)?:?\s*(.+)$/i, key: "apiErrors.invalidField" },
  { test: /must be greater than 0/i, key: "apiErrors.mustBePositive" },
  { test: /Required$/i, key: "apiErrors.fieldRequired" },
  // uniqueness
  {
    test: /(?:already exists|duplicate key value|must be unique)/i,
    key: "apiErrors.duplicate",
  },
  // generic shapes
  { test: /^(.+) (?:was |is )?not found$/i, key: "apiErrors.entityNotFound" },
  { test: /not allowed|cannot be|is not permitted/i, key: "apiErrors.forbidden" },
]

const BY_STATUS: Record<number, string> = {
  400: "apiErrors.badRequest",
  401: "apiErrors.unauthorized",
  403: "apiErrors.forbidden",
  404: "apiErrors.notFound",
  409: "apiErrors.conflict",
  422: "apiErrors.unprocessable",
  429: "apiErrors.tooManyRequests",
  500: "apiErrors.serverError",
  502: "apiErrors.serviceUnavailable",
  503: "apiErrors.serviceUnavailable",
  504: "apiErrors.timeout",
}

/**
 * Character-by-character rather than a regex: the equivalent pattern needs a
 * control-character range, which the linter rejects.
 */
const hasNonAscii = (value: string): boolean => {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 127) {
      return true
    }
  }
  return false
}

const resolve = (key: string, options?: Record<string, unknown>): string => {
  const translated = i18n.t(key, options)
  // i18next echoes the key back when nothing resolves; that is worse than the
  // English it would have replaced.
  return translated && translated !== key ? translated : ""
}

/**
 * Turn any backend/network error message into panel language. Exported so a
 * caller holding a raw `Error` (not a `ClientError`) can go through the same
 * table instead of inventing its own wording.
 */
export const localizeApiMessage = (
  message: string | undefined,
  status?: number
): string => {
  const raw = (message ?? "").trim()

  if (raw) {
    const exact = EXACT[raw]
    if (exact) {
      const hit = resolve(exact)
      if (hit) return hit
    }

    for (const { test, key } of PATTERNS) {
      const match = raw.match(test)
      if (!match) continue
      const hit = resolve(key, { detail: match[1] ?? "" })
      if (hit) return hit
    }
  }

  const statusKey = status ? BY_STATUS[status] : undefined
  const fallback = resolve(statusKey ?? "apiErrors.unknown")

  if (raw && fallback) {
    // Untranslated backend text is a gap in this table, not something to show.
    // eslint-disable-next-line no-console
    console.error(`[api-error] untranslated backend message: ${raw}`)
  }

  return fallback || raw
}

/**
 * For call sites holding an arbitrary thrown value (a `ClientError` whose
 * message the SDK already localized passes through unchanged, because the
 * translated string matches no rule and there is no status to fall back to).
 */
export const translateApiError = (error: unknown): string => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : ""
  const status = (error as { status?: number })?.status

  if (!message) {
    return resolve("apiErrors.unknown") || ""
  }

  // Already localized by the transformer (or written by the panel itself):
  // a message carrying non-ASCII characters cannot be a raw backend string.
  if (hasNonAscii(message)) {
    return message
  }

  return localizeApiMessage(message, status)
}

export const installApiErrorTranslator = () => {
  setClientErrorMessageTransformer((message, context) =>
    localizeApiMessage(message, context?.status)
  )
}
