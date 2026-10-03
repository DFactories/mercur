export type OfferDraftStatus = "open" | "completed"

/** Part of the importer contract: additive only, never renamed. */
export const OfferDraftRefusals = {
  EXTERNAL_ID_CONFLICT: "external_id_conflict",
  SELLER_NOT_FOUND: "seller_not_found",
  PRODUCT_NOT_FOUND: "product_not_found",
  VARIANT_NOT_FOUND: "variant_not_found",
  VARIANT_NOT_IN_PRODUCT: "variant_not_in_product",
  PRODUCT_NOT_OFFERABLE: "product_not_offerable",
  ACTIVE_OFFER_EXISTS: "active_offer_exists",
  OPEN_DRAFT_EXISTS: "open_draft_exists",
} as const

export type OfferDraftRefusalCode =
  (typeof OfferDraftRefusals)[keyof typeof OfferDraftRefusals]

export type OfferDraftRow = {
  id: string
  seller_id: string
  product_id: string
  variant_id: string | null
  external_id: string | null
  status: OfferDraftStatus
  completed_offer_id: string | null
  completed_at: Date | string | null
  created_by: string | null
  metadata: Record<string, unknown> | null
  created_at: Date | string
  updated_at: Date | string
}

export type CreateOfferDraftInput = {
  seller_id: string
  product_id: string
  variant_id: string | null
  external_id: string
  metadata?: Record<string, unknown> | null
  created_by?: string | null
}

export type OfferDraftRefusal = {
  code: OfferDraftRefusalCode
  message: string
  offer_ids?: string[]
  draft_id?: string
}

export type CreateOfferDraftOutcome =
  | { outcome: "created" | "existing"; draft: OfferDraftRow }
  | { outcome: "refused"; error: OfferDraftRefusal }

export type CreatedOfferRef = {
  id: string
  seller_id: string
  product_id: string | null
  variant_id: string
}

/**
 * A key names one import item: one store, one product, and per variant one
 * draft. The draft it already names for this variant comes back as `existing`,
 * whatever its status. The key on any other store or product is a conflict,
 * even for a variant it has not named yet — the mapping changed, and the old
 * drafts have to be deleted rather than silently joined.
 */
export const outcomeForKey = (
  drafts: OfferDraftRow[],
  input: Pick<
    CreateOfferDraftInput,
    "seller_id" | "product_id" | "variant_id" | "external_id"
  >
): CreateOfferDraftOutcome | null => {
  const elsewhere = drafts.find(
    (d) => d.seller_id !== input.seller_id || d.product_id !== input.product_id
  )
  if (elsewhere) {
    return {
      outcome: "refused",
      error: {
        code: OfferDraftRefusals.EXTERNAL_ID_CONFLICT,
        message: `external_id ${input.external_id} already names draft ${elsewhere.id} for another store or product`,
        draft_id: elsewhere.id,
      },
    }
  }
  const same = drafts.find((d) => (d.variant_id ?? null) === input.variant_id)
  return same ? { outcome: "existing", draft: same } : null
}

/** Whether an open draft is already covered by, or covers, the one asked for. */
export const findBlockingDraft = (
  open: OfferDraftRow[],
  variantId: string | null
): OfferDraftRow | undefined =>
  open.find(
    (draft) =>
      variantId === null ||
      draft.variant_id === null ||
      draft.variant_id === variantId
  )
