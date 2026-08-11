import { formatProvider } from "./format-provider"

/**
 * What a seller is told the money came through.
 *
 * The order page used to render `payment.provider_id` verbatim under a
 * `capitalize` class, which turned the raw id into a fake word: shoppers' orders
 * showed `Pp_system_default`, and a real gateway payment showed
 * `Pp_vandar_vandar`. `capitalize` only ever touched the first letter, so the
 * underscores and the doubled vendor name stayed exactly as stored.
 *
 * Unlike the storefront — where the gateway BRAND is deliberately withheld and
 * only its role is shown — the panel names it outright. A seller reconciling a
 * payout needs to know which PSP settled the transaction; they are a business
 * counterparty, not a shopper being shielded from an operational detail.
 *
 * Unknown providers fall back to {@link formatProvider}, the humaniser the
 * region tables already use, so a gateway added before this map is updated
 * reads as "Stripe (USD)" rather than `pp_stripe_usd`. That fallback is the
 * whole point: the raw id must never reach a seller again.
 */
export const paymentProviderLabelKey = (providerId: string): string =>
  `orders.payment.providers.${providerId}`

export const paymentProviderFallback = (providerId: string): string => {
  try {
    return formatProvider(providerId)
  } catch {
    // `formatProvider` splits on "_" and indexes the result; an id with no
    // underscore would throw on `.split("-")` of an undefined name. A label is
    // never worth crashing the order page for.
    return providerId
  }
}
