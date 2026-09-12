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
  // Address forms (shipping, billing, customer addresses, locations): the
  // contact number on a delivery is often a landline, and it signs in nothing.
  "lib/schemas.ts",
  "components/forms/address-form/address-form.tsx",
  "pages/customers/customer-edit-address/components/edit-customer-address-form/edit-customer-address-form.tsx",
  "pages/customers/customer-create-address/components/create-customer-address-form/create-customer-address-form.tsx",
  "pages/locations/location-edit/components/edit-location-form/edit-location-form.tsx",
  "pages/locations/location-create/components/create-location-form/create-location-form.tsx",
  "pages/orders/order-edit-shipping-address/components/edit-order-shipping-address-form/edit-order-shipping-address-form.tsx",
  "pages/orders/order-edit-billing-address/components/edit-order-billing-address-form/edit-order-billing-address-form.tsx",
  // Operator staff profile — admins sign in with email + password.
  "pages/users/user-edit/components/edit-user-form/edit-user-form.tsx",
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
 * The other half of the same incident: the drawers that could have fixed a
 * phone-registered account demanded an email it does not have, so the phone
 * field one row below could never be saved. Structural, because the schema is
 * where it was decided — and where it would be re-decided.
 */
describe("a phone-first account stays editable", () => {
  const emailField = (file: string) => {
    const source = fs.readFileSync(path.join(srcDir, file), "utf-8")
    const start = source.indexOf("email:")
    expect(start).toBeGreaterThan(-1)
    // Up to the next sibling key at the same indentation.
    const rest = source.slice(start)
    const end = rest.search(/\n\s{2,4}[a-z_]+:/)
    return end === -1 ? rest : rest.slice(0, end)
  }

  test.each([
    "pages/stores/store-edit/components/store-edit-form.tsx",
    "pages/customers/customer-edit/components/edit-customer-form/edit-customer-form.tsx",
  ])("%s does not require an email", (file) => {
    expect(emailField(file)).toContain(".optional()")
  })
})
