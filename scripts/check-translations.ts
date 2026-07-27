#!/usr/bin/env bun
/**
 * Fails when a locale still carries the English source string.
 *
 * i18next falls back to `en` for any key it cannot resolve, so an untranslated
 * value is invisible in code review and only shows up as an English word inside
 * an otherwise Persian screen. Copying the English text into `fa.json` produces
 * the same result while looking translated, which is how the product-create
 * attributes tab shipped reading "Attributes / Create new / Add existing".
 *
 * Run: bun run scripts/check-translations.ts
 */

const PACKAGES = ["vendor", "admin"] as const
const LOCALE = "fa"

/**
 * Keys whose Persian value is deliberately identical to the English one.
 * Anything not listed here must be translated.
 */
const ALLOWED_IDENTICAL = new Set([
  // not UI text
  "$schema",
  // pure interpolation / markup, no translatable words
  "general.plusCount",
  "orders.returns.receive.receiveItems",
  "campaigns.totalSpend",
  // acronyms used verbatim in Persian commerce UIs
  "json.header",
  "fields.sku",
  "fields.ean",
  "fields.upc",
  "fields.isbn",
  "fields.asin",
  "fields.gtin",
  "offers.fields.sku",
  "offers.fields.ean",
  "offers.fields.upc",
  // international bank codes
  "onboarding.wizard.payment.swiftBic",
  "store.paymentDetails.fields.bic",
  "store.paymentDetails.fields.swiftBic",
  // machine-readable sample values shown as placeholders
  "returnReasons.fields.value.placeholder",
  "refundReasons.fields.code.placeholder",
  "orders.shipment.trackingUrlPlaceholder",
])

type Tree = { [key: string]: string | Tree }

const flatten = (tree: Tree, prefix = ""): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === "string") {
      out[path] = value
    } else {
      Object.assign(out, flatten(value, path))
    }
  }
  return out
}

const load = async (pkg: string, locale: string): Promise<Record<string, string>> =>
  flatten(await Bun.file(`packages/${pkg}/src/i18n/translations/${locale}.json`).json())

let failed = false

for (const pkg of PACKAGES) {
  const en = await load(pkg, "en")
  const target = await load(pkg, LOCALE)

  const missing = Object.keys(en).filter((key) => !(key in target))
  const untranslated = Object.keys(en).filter(
    (key) =>
      key in target &&
      target[key].trim() === en[key].trim() &&
      /\p{L}/u.test(en[key]) &&
      !ALLOWED_IDENTICAL.has(key)
  )

  if (missing.length === 0 && untranslated.length === 0) {
    console.log(`✓ ${pkg}: ${Object.keys(en).length} keys translated`)
    continue
  }

  failed = true
  console.error(`✗ ${pkg}`)
  for (const key of missing) {
    console.error(`    missing in ${LOCALE}.json: ${key}`)
  }
  for (const key of untranslated) {
    console.error(`    still English: ${key} = ${JSON.stringify(en[key])}`)
  }
}

if (failed) {
  console.error(
    `\nTranslate the keys above in the ${LOCALE}.json files, or add them to ` +
      `ALLOWED_IDENTICAL in this script when the English text is intentional.`
  )
  process.exit(1)
}
