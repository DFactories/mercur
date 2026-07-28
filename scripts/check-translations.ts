#!/usr/bin/env bun
/**
 * Fails when a locale still carries untranslated English.
 *
 * i18next falls back to `en` for any key it cannot resolve, so an untranslated
 * value is invisible in code review and only shows up as an English word inside
 * an otherwise Persian screen. Copying the English text into `fa.json` produces
 * the same result while looking translated, which is how the product-create
 * attributes tab shipped reading "Attributes / Create new / Add existing".
 *
 * Comparing against `en.json` is not enough: `useForVariants` read
 * "Use for Variations" in fa against "Use for variants" in en, so an
 * equality check waved it through. The rule is therefore about the script the
 * value is written in — a Persian string has to contain Persian letters.
 * Mixed values ("SKU باید منحصر به فرد باشد") are fine; Latin-only ones are not.
 *
 * Run: bun run scripts/check-translations.ts
 */

const PACKAGES = ["vendor", "admin"] as const
const LOCALE = "fa"

/**
 * Keys whose value is deliberately written in Latin script.
 * Anything not listed here must contain Persian letters.
 */
const ALLOWED_LATIN = new Set([
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

const LATIN = /[A-Za-z]/
const PERSIAN = /[؀-ۿ]/

let failed = false

for (const pkg of PACKAGES) {
  const en = await load(pkg, "en")
  const target = await load(pkg, LOCALE)

  const missing = Object.keys(en).filter((key) => !(key in target))
  const untranslated = Object.keys(target).filter(
    (key) =>
      LATIN.test(target[key]) &&
      !PERSIAN.test(target[key]) &&
      !ALLOWED_LATIN.has(key)
  )

  if (missing.length === 0 && untranslated.length === 0) {
    console.log(`✓ ${pkg}: ${Object.keys(target).length} keys translated`)
    continue
  }

  failed = true
  console.error(`✗ ${pkg}`)
  for (const key of missing) {
    console.error(`    missing in ${LOCALE}.json: ${key}`)
  }
  for (const key of untranslated) {
    console.error(`    not translated: ${key} = ${JSON.stringify(target[key])}`)
  }
}

if (failed) {
  console.error(
    `\nTranslate the keys above in the ${LOCALE}.json files, or add them to ` +
      `ALLOWED_LATIN in this script when Latin script is intentional.`
  )
  process.exit(1)
}
