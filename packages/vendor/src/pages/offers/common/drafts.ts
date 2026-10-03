import { OfferProduct } from "./types"

export const openDraftsOf = (row: OfferProduct) => row.offer_drafts ?? []

export const countOfferedVariants = (row: OfferProduct) =>
  (row.variants ?? []).filter((v) => (v.offers?.length ?? 0) > 0).length

/** A row the seller was set up to sell and has not priced or stocked yet. */
export const isDraftOnly = (row: OfferProduct) =>
  countOfferedVariants(row) === 0 && openDraftsOf(row).length > 0

/**
 * The create-offer form opened on the draft's product — narrowed to its
 * variant when the drafts name exactly one. Relative to the offers list.
 */
export const completeDraftPath = (row: OfferProduct): string | null => {
  const drafts = openDraftsOf(row)
  if (!drafts.length) {
    return null
  }
  const params = new URLSearchParams({ product_id: row.id })
  const [only] = drafts
  if (drafts.length === 1 && only.variant_id) {
    params.set("variant_id", only.variant_id)
  }
  return `create?${params.toString()}`
}
