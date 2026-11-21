import {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { toLatinDigits } from "../../utils/normalize-match-text"

const PERSIAN_ZERO = 0x06f0

const toPersianDigits = (input: string) =>
  input.replace(/[0-9]/g, (d) => String.fromCharCode(PERSIAN_ZERO + Number(d)))

const toPersianLetters = (input: string) =>
  input.replace(/[يى]/g, "ی").replace(/ك/g, "ک")

const toArabicLetters = (input: string) =>
  input.replace(/ی/g, "ي").replace(/ک/g, "ك")

/**
 * A product search finds the same products whichever keyboard typed it
 * (decided 2026-10-07: digits must not change a result).
 *
 * Titles keep what was typed — «ظرف تک پرس کد ۱۰۵», or «كيسه» from an Arabic
 * keyboard — while SKUs are stored in Latin, and Postgres `ILIKE` folds neither
 * digits nor ي/ی and ك/ک. So no single spelling of `q` is right. When `q`
 * carries a digit or one of those letters it is searched in each spelling with
 * Medusa's own `q` (title, subtitle, description, variant SKU and barcodes),
 * and the list is narrowed to the union. Otherwise nothing changes.
 *
 * A title that mixes the two alphabets in one word is found by neither.
 */
export const applyDigitInsensitiveSearch = async (
  req: AuthenticatedMedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) => {
  const q = req.filterableFields?.q
  if (typeof q !== "string" || !/[0-9۰-۹٠-٩يىكیک]/.test(q)) {
    return next()
  }

  const latin = toLatinDigits(q)
  const forms = Array.from(
    new Set(
      [latin, toPersianDigits(latin)].flatMap((form) => [
        toPersianLetters(form),
        toArabicLetters(form),
      ])
    )
  )

  delete req.filterableFields.q

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const results = await Promise.all(
    forms.map((form) =>
      query.graph({ entity: "product", fields: ["id"], filters: { q: form } })
    )
  )
  const ids = Array.from(
    new Set(results.flatMap(({ data }) => (data as { id: string }[]).map((p) => p.id)))
  )

  const existingAnd = (req.filterableFields.$and as object[] | undefined) ?? []
  req.filterableFields.$and = [
    ...existingAnd,
    { id: ids.length ? ids : ["__none__"] },
  ]

  return next()
}
