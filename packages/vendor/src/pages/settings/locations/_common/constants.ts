export enum FulfillmentSetType {
  Shipping = "shipping",
  Pickup = "pickup",
}

export enum ShippingOptionPriceType {
  FlatRate = "flat",
  Calculated = "calculated",
}

/**
 * Whether a fulfillment provider can price a shipping option at checkout.
 *
 * Medusa rejects `price_type: "calculated"` at create time when the provider's
 * `canCalculate()` is false ("Cannot calcuate pricing for: [...] shipping
 * option(s)."), so offering the choice for a provider that cannot calculate
 * is a guaranteed failure. `manual_manual` — currently the only provider a
 * vendor can be on — always returns false and its `calculatePrice()` throws.
 *
 * Any provider added later is assumed capable; drop it in here if it is not.
 */
const PROVIDERS_WITHOUT_CALCULATED_PRICING = ["manual_manual"]

export const providerSupportsCalculatedPricing = (
  providerId?: string | null
): boolean =>
  !!providerId && !PROVIDERS_WITHOUT_CALCULATED_PRICING.includes(providerId)

export const GEO_ZONE_STACKED_MODAL_ID = "geo-zone"

export const CONDITIONAL_PRICES_STACKED_MODAL_ID = "conditional-prices"

export const ITEM_TOTAL_ATTRIBUTE = "item_total"
export const REGION_ID_ATTRIBUTE = "region_id"
