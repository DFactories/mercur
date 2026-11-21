import {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaContainer } from "@medusajs/framework/types"
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
 * The ids of the `entity` rows `q` finds in any spelling, or `null` when `q`
 * has nothing to fold (the caller then leaves Medusa's own `q` alone).
 *
 * Text keeps what was typed — «ظرف تک پرس کد ۱۰۵», or «كيسه» from an Arabic
 * keyboard — while SKUs and phone numbers are stored in Latin, and Postgres
 * `ILIKE` folds neither digits nor ي/ی and ك/ک. So no single spelling of `q`
 * is right: it is run in each one with Medusa's own `q` (the entity's
 * searchable columns) and the answer is the union.
 *
 * A word that mixes the two alphabets is found by neither.
 */
export const searchIdsInEverySpelling = async (
  scope: MedusaContainer,
  entity: string,
  q: unknown
): Promise<string[] | null> => {
  if (typeof q !== "string" || !/[0-9۰-۹٠-٩يىكیک]/.test(q)) {
    return null
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

  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const results = await Promise.all(
    forms.map((form) =>
      query.graph({ entity, fields: ["id"], filters: { q: form } })
    )
  )

  return Array.from(
    new Set(results.flatMap(({ data }) => (data as { id: string }[]).map((row) => row.id)))
  )
}

/**
 * A list search finds the same rows whichever keyboard typed it (decided
 * 2026-10-07: digits must not change a result). Replaces `q` with the ids it
 * finds in every spelling; the route's other filters still apply.
 */
export const applySpellingInsensitiveSearch =
  (entity: string) =>
  async (
    req: AuthenticatedMedusaRequest,
    _res: MedusaResponse,
    next: MedusaNextFunction
  ) => {
    const ids = await searchIdsInEverySpelling(
      req.scope,
      entity,
      req.filterableFields?.q
    )
    if (!ids) {
      return next()
    }

    delete req.filterableFields.q

    const existingAnd = (req.filterableFields.$and as object[] | undefined) ?? []
    req.filterableFields.$and = [
      ...existingAnd,
      { id: ids.length ? ids : ["__none__"] },
    ]

    return next()
  }

export const applyDigitInsensitiveSearch = applySpellingInsensitiveSearch("product")
