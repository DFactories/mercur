import fs from "fs"
import path from "path"
import { describe, expect, test } from "vitest"

/**
 * DFactories, owner decision 187. Our sales programme is «همکار فروش» (plural
 * «همکاران فروش»), never «نماینده», «نمایندگی» or «بازاریاب». This reads the
 * Persian translations of both forked panels, like producer-term beside it; the
 * host panels' own copy and the backend's are dfactories-mp's to check. A
 * physical sales agency is a real-world use, not the programme: allow its key
 * in ALLOWED_KEYS, never loosen the pattern.
 */
const PROGRAMME_WORD = /نمایند(?:[هةۀ]|گی|گان)|بازاریاب/u

// A stock location can be «نمایندگی فروش»: a place where stock is kept.
const ALLOWED_KEYS = ["stockLocations.create.hint"]

const FLAGGED = [
  "نماینده",
  "نمایندهٔ فروش",
  "نماینده‌ی",
  "نمایندگی",
  "نمایندگان",
  "بازاریاب",
  "بازاریاب‌ها",
  "بازاریابان",
]

const PASSES = [
  "همکار فروش",
  "همکاران فروش",
  "همکاری در فروش",
  "سهم همکار فروش",
  "نمایش",
  "نماد",
  "می‌نمایند",
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

/** The key path of every string that names the programme the old way. */
const offenders = (tree: unknown) =>
  strings(tree)
    .filter(([, text]) => PROGRAMME_WORD.test(text.normalize("NFC")))
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

const read = (file: string) =>
  JSON.parse(fs.readFileSync(path.join(packagesDir, file), "utf-8"))

describe("the sales programme is «همکار فروش» in the forked panels", () => {
  test.each(FLAGGED)("flags %s", (text) => {
    expect(PROGRAMME_WORD.test(text.normalize("NFC"))).toBe(true)
  })

  test.each(PASSES)("passes %s", (text) => {
    expect(PROGRAMME_WORD.test(text.normalize("NFC"))).toBe(false)
  })

  test("reads both panels", () => {
    expect(persian).toEqual(
      expect.arrayContaining([
        "vendor/src/i18n/translations/fa.json",
        "admin/src/i18n/translations/fa.json",
      ])
    )
  })

  // So the allowlist cannot go stale silently.
  test.each(["vendor", "admin"])(
    "%s fa.json still holds each allowed real-world use",
    (panel) => {
      const flagged = offenders(read(`${panel}/src/i18n/translations/fa.json`))
      for (const key of ALLOWED_KEYS) expect(flagged).toContain(key)
    }
  )

  test.each(persian)("%s calls the programme «همکار فروش»", (file) => {
    expect(
      offenders(read(file)).filter((key) => !ALLOWED_KEYS.includes(key))
    ).toEqual([])
  })
})
