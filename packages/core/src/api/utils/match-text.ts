import { z } from "zod"

import { normalizeMatchRecord, normalizeMatchText } from "../../utils/normalize-match-text"

export {
  normalizeMatchRecord,
  normalizeMatchText,
  sameMatchText,
} from "../../utils/normalize-match-text"

/** A string field normalized on the way in. */
export const matchText = () => z.string().transform(normalizeMatchText)

/** A variant's option map normalized on the way in. */
export const matchTextRecord = () =>
  z.record(z.string(), z.string()).transform(normalizeMatchRecord)

/** An attribute's scalar value: only a string has digits to normalize. */
export const matchScalar = () =>
  z
    .union([z.string(), z.number(), z.boolean()])
    .transform((value) =>
      typeof value === "string" ? normalizeMatchText(value) : value
    )
