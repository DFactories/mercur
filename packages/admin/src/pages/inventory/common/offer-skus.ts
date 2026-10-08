type ItemWithOffers = {
  offers?: Array<{ sku?: string | null }> | null
}

/**
 * An item created with an offer carries no SKU of its own: inventory SKUs are
 * unique across the whole platform, and two stores may use the same code on
 * one master product. The offer's SKU is the store's, so it stands in.
 */
export const offerSkus = (item: ItemWithOffers) =>
  Array.from(
    new Set((item.offers ?? []).map((o) => o.sku).filter(Boolean)),
  ).join("، ")
