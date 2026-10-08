const PERSIAN_ZERO = 0x06f0
const ARABIC_ZERO = 0x0660

export const toLatinDigits = (input: string): string =>
  input.replace(/[۰-۹٠-٩]/g, (ch) => {
    const code = ch.charCodeAt(0)
    return String(code - (code >= PERSIAN_ZERO ? PERSIAN_ZERO : ARABIC_ZERO))
  })

const INVISIBLE_MARKS = /[\u064B-\u0653\u0656-\u065F\u0670\u0640\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g

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
 *
 * Marks nobody sees are dropped too: a Persian keyboard's Shift+A types a
 * fatha, which reached production as «َََََAL105-70-1000» (2026-10-08), and
 * copy-pasting adds direction marks. The ZWNJ (نیم‌فاصله) and the hamza of
 * «بستهٔ» stay — they are spelling, not noise.
 */
export function normalizeMatchText(input: string): string {
  return toLatinDigits(input.replace(INVISIBLE_MARKS, ""))
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
