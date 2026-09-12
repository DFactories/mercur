import { MedusaError } from "@medusajs/framework/utils"
import { z } from "zod"

/**
 * The one definition of "a phone number this marketplace can sign in".
 *
 * Every account here — producer and shopper alike — is reached by an SMS code,
 * so a number that cannot receive one is not a contact detail with a typo in
 * it: it is an account nobody can ever open. A landline typed at registration
 * passed validation, took the sign-up, and then sat there while the code went
 * to a phone that does not ring. The only honest place to refuse it is before
 * the account exists.
 *
 * Latin, Persian (۰۱۲…) and Arabic-Indic (٠١٢…) digits are all the same number:
 * a Persian keyboard is the default on most of our users' phones, and a form
 * that rejects what that keyboard produces is broken for the majority.
 */

const PERSIAN_ZERO = 0x06f0
const ARABIC_ZERO = 0x0660

/** Persian/Arabic-Indic digits → Latin. Everything else passes through. */
export function toLatinDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (ch) => {
    const code = ch.charCodeAt(0)
    const base = code >= PERSIAN_ZERO ? PERSIAN_ZERO : ARABIC_ZERO
    return String(code - base)
  })
}

/** Iranian mobile in canonical local form: 09 + 9 digits = 11 digits. */
export const IRAN_MOBILE_RE = /^09\d{9}$/

/**
 * Reduce any common way of writing an Iranian mobile to the single local form
 * we store and compare (09xxxxxxxxx). Does NOT decide validity — a landline or
 * a half-typed number comes back unchanged, for {@link isIranMobile} to reject.
 */
export function normalizeIranPhone(input: string): string {
  let p = toLatinDigits(input).replace(/[\s\-()._]/g, "")
  if (p.startsWith("+98")) {
    p = "0" + p.slice(3)
  } else if (p.startsWith("0098")) {
    p = "0" + p.slice(4)
  } else if (p.startsWith("98") && p.length === 12) {
    p = "0" + p.slice(2)
  } else if (/^9\d{9}$/.test(p)) {
    // The leading zero is the one digit people drop when dictating a number.
    p = "0" + p
  }
  return p
}

/** True when the input is an Iranian mobile in any accepted spelling. */
export function isIranMobile(input: string | null | undefined): boolean {
  return !!input && IRAN_MOBILE_RE.test(normalizeIranPhone(input))
}

/**
 * Normalize or refuse. `INVALID_PHONE` is a code, not a sentence: every panel
 * and the storefront map it to their own localized copy.
 */
export function assertIranMobile(input: string): string {
  const normalized = normalizeIranPhone(input)
  if (!IRAN_MOBILE_RE.test(normalized)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "INVALID_PHONE")
  }
  return normalized
}

/**
 * Every format the same number may already be sitting in, for `$in` lookups
 * against rows written before normalization was enforced.
 */
export function iranMobileVariants(input: string): string[] {
  const normalized = normalizeIranPhone(input)
  const variants = new Set<string>([normalized])
  if (normalized.startsWith("0")) {
    const local = normalized.slice(1)
    variants.add(local)
    variants.add("98" + local)
    variants.add("+98" + local)
    variants.add("0098" + local)
  }
  return Array.from(variants)
}

/**
 * Request-body field for a number that must be able to receive an OTP. It
 * normalizes as it validates, so what reaches the database is always the
 * canonical form and a later lookup cannot miss it on spelling alone.
 */
export const iranMobileField = () =>
  z
    .string()
    .transform((value) => normalizeIranPhone(value))
    .refine((value) => IRAN_MOBILE_RE.test(value), {
      message: "INVALID_PHONE",
    })

/**
 * The same field where the number is optional (and may be cleared with null or
 * an empty string). An empty string normalizes to null rather than to "", so a
 * cleared field reads as "no phone" everywhere instead of as an empty one.
 *
 * `undefined` must survive the transform as `undefined`. These schemas validate
 * PATCH-shaped bodies where an absent key means "leave it alone": folding it to
 * null here would make every unrelated seller update — a closure window, a
 * status change, a premium toggle — silently erase the store's phone number and
 * its SMS verification with it.
 */
export const optionalIranMobileField = () =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return undefined
      }
      if (value === null || value.trim() === "") {
        return null
      }
      return normalizeIranPhone(value)
    })
    .refine(
      (value) =>
        value === undefined || value === null || IRAN_MOBILE_RE.test(value),
      { message: "INVALID_PHONE" }
    )
