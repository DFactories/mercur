import fs from "fs"
import path from "path"
import { describe, expect, test } from "vitest"

/**
 * DFactories, TECH_DEBT 120. Owner rule: a producer is «تولیدکننده», never
 * «فروشنده» or «تامین‌کننده»/«تأمین‌کننده». This reads the Persian
 * translations of both forked panels, vendor's here and admin's
 * (`packages/admin`), like the brand check beside it. The host panels' own
 * copy and the backend's are dfactories-mp's to check. The verb «می‌فروشند»
 * ("they sell") passes.
 */
// shortcut: a word assembled by interpolation or `$t()` nesting, and a tatweel
// or ZWNJ inside «فروشنده», pass; the post-deploy bundle grep catches those.
// Text is NFC-normalised first, so «تأمین» typed as ا + U+0654 reads as أ.
const SELLER_WORD =
  /فروشند(?:[هةۀ]|گان|گی)|ت[اأآ]م[یيى]ن[\s\p{Default_Ignorable_Code_Point}\p{Pd}\u0640]*[کك]نند(?:[هةۀ]|گان|گی)/u

const FLAGGED = [
  "فروشنده",
  "فروشندگان",
  "فروشنده‌ای",
  "فروشنده‌ها",
  "فروشندهٔ",
  "فروشندگی",
  "فروشندة",
  "تامین‌کننده",
  "تأمین‌کننده",
  "تآمین‌کننده",
  "تامین کننده",
  "تامینکننده",
  "تأمین‌کنندگان",
  "تامین‌کنندگی",
  "تامين‌كننده",
  "تامین کننده",
  "تامین​کننده",
  "تامین­کننده",
  "تامینـکننده",
  "پنل تامین‌کننده",
  "فروشندۀ",
  "تامین‌کنندۀ",
  "تامین-کننده",
  "تا\u0654مین\u200cکننده",
]

const PASSES = [
  "تولیدکننده",
  "تولیدکنندگان",
  "تولیدکننده‌ی تأییدشده",
  "می‌فروشند",
  "بفروشند",
  "نمی‌فروشند",
  "بازاریابان مستقل برای شما بفروشند.",
  "فروشگاه",
  "فروش",
  "پیش‌فروش",
  "همکار فروش",
  "بازاریاب",
  "تأمین مالی",
  "تأمین موجودی",
  "ارائه‌دهنده‌ی پرداخت",
  "ارائه‌دهنده پردازش",
]

/** Every string in a translation tree, as `[key path, text]`. */
const strings = (value: unknown, prefix = ""): [string, string][] =>
  typeof value === "string"
    ? [[prefix, value]]
    : value && typeof value === "object"
      ? Object.entries(value).flatMap(([key, child]) =>
          strings(child, prefix ? `${prefix}.${key}` : key)
        )
      : []

/** The key path of every string that calls a producer something else. */
const offenders = (tree: unknown) =>
  strings(tree)
    .filter(([, text]) => SELLER_WORD.test(text.normalize("NFC")))
    .map(([key]) => key)

const packagesDir = path.join(__dirname, "../../../../..")

// `vendor/…/fa.json` and `admin/…/fa.json`, relative to `packages`.
const persian = ["vendor", "admin"].flatMap((panel) => {
  const dir = `${panel}/src/i18n/translations`
  return fs
    .readdirSync(path.join(packagesDir, dir))
    .filter((file) => /^fa.*\.json$/.test(file))
    .map((file) => `${dir}/${file}`)
})

describe("a producer is «تولیدکننده» in the forked panels", () => {
  test.each(FLAGGED)("flags %s", (text) => {
    expect(SELLER_WORD.test(text.normalize("NFC"))).toBe(true)
  })

  test.each(PASSES)("passes %s", (text) => {
    expect(SELLER_WORD.test(text.normalize("NFC"))).toBe(false)
  })

  test("reads a JSON-escaped value once parsed", () => {
    const escaped = '{"a": {"b": "\\u0641\\u0631\\u0648\\u0634\\u0646\\u062f\\u0647"}}'
    expect(offenders(JSON.parse(escaped))).toEqual(["a.b"])
  })

  test("reads both panels", () => {
    expect(persian).toEqual(
      expect.arrayContaining([
        "vendor/src/i18n/translations/fa.json",
        "admin/src/i18n/translations/fa.json",
      ])
    )
  })

  test.each(persian)("%s calls a producer «تولیدکننده»", (file) => {
    const tree = JSON.parse(
      fs.readFileSync(path.join(packagesDir, file), "utf-8")
    )
    expect(offenders(tree)).toEqual([])
  })
})
