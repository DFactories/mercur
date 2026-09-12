import fs from "fs"
import path from "path"
import { describe, expect, test } from "vitest"

/**
 * A number people sign in with is guarded in exactly one place.
 *
 * Production: a producer registered with a landline. Nothing refused it, the
 * account was created, and the OTP went to a phone that cannot receive SMS —
 * an account that existed and could never be opened. The same field existed,
 * unguarded, in the store phone (onboarding and settings) and in both member
 * invites, where a landline invites someone who can never accept.
 *
 * Underneath that sat a second defect: four copies of the same normalizer, and
 * every one of them ignored Persian digits — so `۰۹۱۲…`, which is what the
 * default keyboard on our users' phones produces, was called invalid by the
 * very form asking for it.
 *
 * Both are structural, so the test is structural: the normalizer may not be
 * re-implemented, and a sign-in phone field may not be plain `z.string()`.
 */
const srcDir = path.join(__dirname, "..")

/** Address and staff-profile phones — a landline there is a real phone number. */
const FREE_TEXT_PHONE_ALLOWLIST = [
  // The seller address form (warehouse / pickup contact).
  "lib/schemas.ts",
  "components/forms/address-form/address-form.tsx",
  // Stock-location contact numbers.
  "pages/settings/locations/create/_components/create-location-form.tsx",
  "pages/settings/locations/[location_id]/edit/_components/edit-location-form.tsx",
]

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return entry.name === "node_modules" ? [] : walk(full)
    }
    return /\.tsx?$/.test(entry.name) && !/\.spec\.tsx?$/.test(entry.name)
      ? [full]
      : []
  })

const sourceFiles = walk(srcDir)
const rel = (file: string) => path.relative(srcDir, file)

describe("the sign-in phone guard is not re-implemented", () => {
  test("no file carries its own Iranian-mobile regex", () => {
    const offenders = sourceFiles.filter((file) =>
      /\^09\\d\{9\}\$/.test(fs.readFileSync(file, "utf-8"))
    )

    expect(offenders.map(rel)).toEqual([])
  })

  test("no file hand-rolls a phone normalizer", () => {
    const offenders = sourceFiles.filter((file) =>
      /(const|function)\s+normalize(Iran)?Phone\s*[=(]/.test(
        fs.readFileSync(file, "utf-8")
      )
    )

    expect(offenders.map(rel)).toEqual([])
  })
})

describe("every sign-in phone field uses the shared schema", () => {
  test("a phone field is either an address field or guarded", () => {
    const offenders = sourceFiles
      .filter((file) => !FREE_TEXT_PHONE_ALLOWLIST.includes(rel(file)))
      .filter((file) => /\bphone:\s*zo?d?\./.test(fs.readFileSync(file, "utf-8")))

    expect(offenders.map(rel)).toEqual([])
  })
})

/**
 * The other half of the same incident: a store that signed up by phone has no
 * email, so a required email field in its own settings would lock it out of
 * editing the very number that is wrong.
 */
describe("a phone-first store stays editable", () => {
  test("the store settings form does not require an email", () => {
    const source = fs.readFileSync(
      path.join(srcDir, "pages/settings/store/edit/_components/edit-store-form.tsx"),
      "utf-8"
    )
    const start = source.indexOf("email:")
    expect(start).toBeGreaterThan(-1)
    const rest = source.slice(start)
    const end = rest.search(/\n\s{2,4}[a-z_]+:/)
    expect(end === -1 ? rest : rest.slice(0, end)).toContain(".optional()")
  })
})
