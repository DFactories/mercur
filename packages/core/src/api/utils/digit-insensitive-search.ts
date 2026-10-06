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

/**
 * A product search finds the same products whichever keyboard typed the
 * number (decided 2026-10-07: digits must not change a result).
 *
 * Titles keep the digits they were written with — «ظرف تک پرس کد ۱۰۵» — while
 * SKUs are stored in Latin, so neither spelling of `q` alone is right. When `q`
 * carries a digit it is searched in both spellings with Medusa's own `q`
 * (title, subtitle, description, variant SKU and barcodes), and the list is
 * narrowed to the union. Without a digit nothing changes.
 */
export const applyDigitInsensitiveSearch = async (
  req: AuthenticatedMedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) => {
  const q = req.filterableFields?.q
  if (typeof q !== "string" || !/[0-9۰-۹٠-٩]/.test(q)) {
    return next()
  }

  const latin = toLatinDigits(q)
  const forms = Array.from(new Set([latin, toPersianDigits(latin)]))

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
