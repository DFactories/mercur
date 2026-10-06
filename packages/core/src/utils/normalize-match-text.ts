const PERSIAN_ZERO = 0x06f0
const ARABIC_ZERO = 0x0660

export const toLatinDigits = (input: string): string =>
  input.replace(/[۰-۹٠-٩]/g, (ch) => {
    const code = ch.charCodeAt(0)
    return String(code - (code >= PERSIAN_ZERO ? PERSIAN_ZERO : ARABIC_ZERO))
  })

/**
 * One spelling for the text the platform MATCHES on — attribute and option
 * names and values, variant options, SKUs and barcodes.
 *
 * Production, 2026-10-06: one option held «کارتن 500 عددی» and
 * «کارتن ۵۰۰ عددی» side by side, a variant saved with one could not be
 * approved against the other, and «50میکرون» sat next to «50 میکرون». The
 * same thing typed on a Persian or a Latin keyboard became two values.
 *
 * Decided by the operator (2026-10-07): on save, in these fields only,
 *   - Persian and Arabic-Indic digits become Latin, and ٫ / ٬ become . / ,
 *   - Arabic ي ى ك become Persian ی ی ک,
 *   - a number directly followed by a Persian word gets a space («50میکرون»
 *     → «50 میکرون»).
 * Titles and descriptions keep what was typed; the storefront shows them as
 * written.
 */
export function normalizeMatchText(input: string): string {
  return toLatinDigits(input)
    .replace(/٫/g, ".")
    .replace(/٬/g, ",")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/(\d)(?=[ء-غف-يٮ-ۓۺ-ۿ])/g, "$1 ")
}

/** Keys and values of a variant's `{ option title: value }` map. */
export const normalizeMatchRecord = (
  record: Record<string, string>
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      normalizeMatchText(key),
      normalizeMatchText(value),
    ])
  )

/** Two spellings of the same value, as the platform compares them. */
export const sameMatchText = (a: string, b: string) =>
  normalizeMatchText(a) === normalizeMatchText(b)
