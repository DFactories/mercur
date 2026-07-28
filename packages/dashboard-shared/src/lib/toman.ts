import i18n from "i18next"

/**
 * Medusa stores and charges IRR in rial, but every Iranian-facing surface reads
 * toman — rial ÷ 10. The storefront already divides on display, so a panel that
 * printed raw rial showed the producer a 10× discrepancy for the same price.
 *
 * Display-only on purpose: storage, payment-gateway payloads and any
 * server-side comparison stay in rial. Nothing here may be fed back into a
 * request body.
 */
const RIAL_PER_TOMAN = 10

/** Used until i18next is up, and for any locale missing the key. */
const TOMAN_FALLBACK = "تومان"

export const isTomanCurrency = (currencyCode?: string | null) =>
  currencyCode?.toLowerCase() === "irr"

/**
 * Localized "toman" label. Guarded on `isInitialized` because `t()` returns
 * undefined — not the `defaultValue` — on an instance that has not been
 * initialised yet, which would render "۴۸۰٬۰۰۰ undefined".
 */
export const getTomanLabel = () => {
  if (!i18n.isInitialized) {
    return TOMAN_FALLBACK
  }

  return i18n.t("currencies.toman", { defaultValue: TOMAN_FALLBACK })
    ?? TOMAN_FALLBACK
}

/** Rial amount → a complete, labelled toman string. Callers must not append a currency code. */
export const formatTomanAmount = (amountInRials: number) => {
  const safeAmount =
    typeof amountInRials === "number" && Number.isFinite(amountInRials)
      ? amountInRials
      : 0

  const toman = new Intl.NumberFormat(i18n.language || "fa-IR", {
    maximumFractionDigits: 0,
  }).format(safeAmount / RIAL_PER_TOMAN)

  return `${toman} ${getTomanLabel()}`
}
