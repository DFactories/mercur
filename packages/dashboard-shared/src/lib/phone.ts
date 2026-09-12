import { z } from "zod"

/**
 * The panels' half of the sign-in-number rule. The backend enforces the same
 * thing (`@mercurjs/core`'s `api/utils/phone`) — this is here so the producer
 * or the operator is told at the field, before an SMS is spent and before an
 * account exists that nobody can open.
 *
 * One copy, in the package both panels already depend on: the previous four
 * copies of this normalizer (login form, invite form, store settings,
 * onboarding) all forgot the same thing — a Persian keyboard writes ۰۹۱۲…, and
 * every one of those forms called it invalid.
 */

const PERSIAN_ZERO = 0x06f0
const ARABIC_ZERO = 0x0660

/** Persian/Arabic-Indic digits → Latin. Everything else passes through. */
export const toLatinDigits = (input: string): string =>
  input.replace(/[۰-۹٠-٩]/g, (ch) => {
    const code = ch.charCodeAt(0)
    const base = code >= PERSIAN_ZERO ? PERSIAN_ZERO : ARABIC_ZERO
    return String(code - base)
  })

/** Iranian mobile in canonical local form: 09 + 9 digits = 11 digits. */
export const IRAN_MOBILE_RE = /^09\d{9}$/

/** Reduce any accepted spelling to the one form we send and store. */
export const normalizeIranPhone = (input: string): string => {
  let p = toLatinDigits(input).replace(/[\s\-()._]/g, "")
  if (p.startsWith("+98")) {
    p = "0" + p.slice(3)
  } else if (p.startsWith("0098")) {
    p = "0" + p.slice(4)
  } else if (p.startsWith("98") && p.length === 12) {
    p = "0" + p.slice(2)
  } else if (/^9\d{9}$/.test(p)) {
    // The leading zero is the digit people drop when dictating a number.
    p = "0" + p
  }
  return p
}

/** True when the input is an Iranian mobile in any accepted spelling. */
export const isIranMobile = (input: string | null | undefined): boolean =>
  !!input && IRAN_MOBILE_RE.test(normalizeIranPhone(input))

/**
 * Required phone field for a form schema. Normalizes as it validates, so the
 * value the form submits is already canonical.
 *
 * `invalidMessage` / `requiredMessage` are passed in rather than read here:
 * these schemas are built at module load, before i18n has a language, so each
 * panel supplies its own already-resolved strings. An empty field is told it is
 * missing, not that it is wrong — those are different mistakes.
 */
export const iranMobileSchema = (
  invalidMessage: string,
  requiredMessage?: string
) =>
  z
    .string()
    .trim()
    .transform(normalizeIranPhone)
    .superRefine((value, ctx) => {
      if (!value) {
        ctx.addIssue({
          code: "custom",
          message: requiredMessage ?? invalidMessage,
        })
        return
      }
      if (!IRAN_MOBILE_RE.test(value)) {
        ctx.addIssue({ code: "custom", message: invalidMessage })
      }
    })

/** The same field where leaving it empty is allowed. */
export const optionalIranMobileSchema = (message: string) =>
  z
    .string()
    .trim()
    .transform(normalizeIranPhone)
    .refine((value) => value === "" || IRAN_MOBILE_RE.test(value), { message })
