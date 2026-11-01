import fs from "fs"
import path from "path"
import { describe, expect, test } from "vitest"

/**
 * DFactories, TECH_DEBT 111. The brand has one Persian spelling: «دی فکتوریز»,
 * two words with a plain space (owner, 2026-10-31). The ZWNJ form, the joined
 * form and the Arabic-letter forms are other words to a search engine and to a
 * reader. The host repo's guard reads only its own copy, never this fork's
 * bundles, so this reads the Persian translations of both forked panels:
 * vendor's here and admin's (`packages/admin`), one guard instead of two.
 */
const BRAND = "دی فکتوریز"

// Every spelling of the two words: Arabic ي/ى, ك and ؤ, and any run of spaces,
// invisible characters (ZWNJ, NBSP, soft hyphen, bidi marks…), dashes or
// tatweel between them, an empty run included.
const ANY_SPELLING =
  /د[یيى][\s\p{Default_Ignorable_Code_Point}\p{Pd}\u0640]*ف[کك]ت[وؤ]ر[یيى]ز/gu

// shortcut: this reads the JSON text, not what i18next builds from it, so a
// spelling assembled by `$t()` nesting or interpolation, presentation forms,
// and a mark, tatweel or ZWNJ inside either word still pass; the post-deploy
// grep of the live vendor bundle (TD-111 rollout step 4) is the check for those.
// shortcut: Persian copy in the fork's .ts/.tsx files (zod-error-map, jalali,
// auth-hero, core's notification catalog) is not read; none names the brand
// today, walk packages/*/src if one ever does.

const translationsDir = path.join(__dirname, "..")

// HTML's named references for the characters the brand could hide behind.
const NAMED: Record<string, string> = {
  nbsp: "\u00a0",
  shy: "\u00ad",
  thinsp: "\u2009",
  zwnj: "\u200c",
  zwj: "\u200d",
  lrm: "\u200e",
  rlm: "\u200f",
}

// An escaped or encoded line feed reads as U+2028, so line numbers still count
// the file's own lines.
const char = (codePoint: number) =>
  codePoint === 10 ? "\u2028" : String.fromCodePoint(codePoint)

// What a loaded string or a rendered page holds: `\u200c`, `\u{200c}`, `\xa0`,
// Python's `\U0000200c`, an escaped `\n`, `\r` or `\t`, and HTML's or JSX's
// `&zwnj;`, `&#8204;` or `&#x200c;`. A tool that escapes all non-ASCII would
// otherwise hide every Persian word from the check. Kept in step with the
// dfactories-mp guard, which also reads code, HTML and Markdown.
const decode = (text: string) =>
  text
    .replace(/\\[nrt]/g, "\u2028")
    .replace(
      /\\(?:u\{0*([\da-fA-F]{1,5})\}|u([\da-fA-F]{4})|x([\da-fA-F]{2})|U000([\da-fA-F]{5}))/g,
      (_, a, b, c, d) => char(parseInt(a ?? b ?? c ?? d, 16))
    )
    .replace(/&#(?:[xX]0*([\da-fA-F]{1,5})|0*(\d{1,6}));/g, (_, hex, dec) =>
      char(hex ? parseInt(hex, 16) : Number(dec))
    )
    .replace(/&(nbsp|shy|thinsp|zwnj|zwj|lrm|rlm);/g, (_, name) => NAMED[name])

// Spells out every character that is not in BRAND, so an invisible ZWNJ or an
// Arabic ي is readable in the failure.
const visible = (spelling: string) =>
  [...spelling]
    .map((c) =>
      BRAND.includes(c)
        ? c
        : `<U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}>`
    )
    .join("")

/** `file:line spelling` for every match that is not exactly BRAND. */
const offenders = (raw: string, file = "") => {
  const text = decode(raw)
  return [...text.matchAll(ANY_SPELLING)]
    .filter((m) => m[0] !== BRAND)
    .map(
      (m) =>
        `${file}:${text.slice(0, m.index).split("\n").length} ${visible(m[0])}`
    )
}

const packagesDir = path.join(translationsDir, "../../../..")

// `vendor/…/fa.json` and `admin/…/fa.json`, relative to `packages`.
const persian = ["vendor", "admin"].flatMap((panel) => {
  const dir = `${panel}/src/i18n/translations`
  return fs
    .readdirSync(path.join(packagesDir, dir))
    .filter((file) => /^fa.*\.json$/.test(file))
    .map((file) => `${dir}/${file}`)
})

describe("the brand has one Persian spelling", () => {
  test.each([
    ["ZWNJ", "دی\u200cفکتوریز"],
    ["joined", "دیفکتوریز"],
    ["Arabic yeh", "د\u064a فکتور\u064aز"],
    ["alef maksura", "د\u0649 فکتور\u0649ز"],
    ["Arabic kaf", "دی ف\u0643توریز"],
    ["waw with hamza", "دی فکت\u0624ریز"],
    ["NBSP", "دی\u00a0فکتوریز"],
    ["thin space", "دی\u2009فکتوریز"],
    ["zero-width space", "دی\u200bفکتوریز"],
    ["soft hyphen", "دی\u00adفکتوریز"],
    ["tatweel", "دی\u0640فکتوریز"],
    ["hyphen", "دی-فکتوریز"],
    ["double space", "دی  فکتوریز"],
    ["escaped ZWNJ", "دی\\u200cفکتوریز"],
    ["braced escaped ZWNJ", "دی\\u{200c}فکتوریز"],
    ["hex-escaped NBSP", "دی\\xa0فکتوریز"],
    ["escaped line break", "دی\\nفکتوریز"],
    ["HTML-entity ZWNJ", "دی&zwnj;فکتوریز"],
    ["numeric HTML ZWNJ", "دی&#8204;فکتوریز"],
  ])("flags the %s spelling", (_, spelling) => {
    expect(offenders(`همه محصولات ${spelling}`)).toHaveLength(1)
  })

  test("passes «دی فکتوریز»", () => {
    expect(offenders(`همه محصولات ${BRAND}`)).toEqual([])
  })

  test.each(persian)("%s spells it «دی فکتوریز»", (file) => {
    const raw = fs.readFileSync(path.join(packagesDir, file), "utf-8")
    expect(offenders(raw, file)).toEqual([])
  })
})
