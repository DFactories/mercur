/**
 * Opening «ساخت آفر» on a known product: `/offers/create?product_id=…` selects
 * it, and `&variant_id=…` narrows its rows to that one variant.
 *
 * The host's offer drafts link here ("this store sells that product, price and
 * stock still missing"), so completing a draft is creating the offer with this
 * same form and this same route — not a second form with its own rules.
 * Read once, at mount: after that the producer owns the selection.
 */
export type OfferCreatePrefill = {
  productId: string | null;
  variantId: string | null;
};

export const readOfferCreatePrefill = (
  params: URLSearchParams,
): OfferCreatePrefill => {
  const productId = params.get("product_id")?.trim() || null;
  return {
    productId,
    // A variant means nothing without the product it narrows.
    variantId: productId ? params.get("variant_id")?.trim() || null : null,
  };
};

/**
 * Whether a variant gets a row. Only the prefilled product is narrowed — a
 * product the producer adds by hand keeps every variant, as it always has.
 */
export const includesVariant = (
  prefill: OfferCreatePrefill,
  productId: string,
  variantId: string,
): boolean =>
  !prefill.variantId ||
  productId !== prefill.productId ||
  variantId === prefill.variantId;
