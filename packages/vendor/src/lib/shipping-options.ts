import { HttpTypes } from "@medusajs/types"

export function isReturnOption(shippingOption: HttpTypes.AdminShippingOption) {
  return !!shippingOption.rules?.find(
    (r) =>
      r.attribute === "is_return" && r.value === "true" && r.operator === "eq"
  )
}

/**
 * An option minted for one cart — a negotiated or quoted freight price — rather
 * than one the store set up. It belongs to that buyer's checkout only.
 */
export function isCartScopedOption(
  shippingOption: Pick<HttpTypes.AdminShippingOption, "rules">
) {
  return !!shippingOption.rules?.some((r) => r.attribute === "cart_id")
}

export function isOptionEnabledInStore(
  shippingOption: HttpTypes.AdminShippingOption
) {
  return !!shippingOption.rules?.find(
    (r) =>
      r.attribute === "enabled_in_store" &&
      r.value === "true" &&
      r.operator === "eq"
  )
}

/**
 * The name to show for a shipping profile.
 *
 * Seller-scoped profiles may be stored as `<owner>:<name>`; the admin-curated
 * profiles every producer picks from carry a bare name. Taking `split(":")[1]`
 * unconditionally returned `undefined` for every bare name, and the Combobox
 * falls back to printing the selected VALUE when the label is empty — so the
 * edit form showed the profile's id instead of its name.
 */
export function getShippingProfileName(name: string) {
  const separator = name.indexOf(":")
  return separator === -1 ? name : name.slice(separator + 1)
}

/** `shipping_option_type.code`: the buyer pays the carrier on delivery (پس‌کرایه). */
export const FREIGHT_COLLECT_TYPE_CODE = "freight_collect"

/** `shipping_option_type.code`: the producer prices each basket on request. */
export const FREIGHT_QUOTE_TYPE_CODE = "freight_quote"

/**
 * `shipping_option_type.code` of the option the backend mints for ONE cart once
 * a negotiated or quoted carriage is agreed. It is never a store's own choice.
 */
export const QUOTE_FREIGHT_TYPE_CODE = "quote_freight"

/**
 * Whether an option of this type carries no checkout price of its own, so the
 * producer is never asked for one.
 *
 * - freight collect: the buyer settles with the carrier on delivery. A price
 *   here would be charged at checkout ON TOP of that, while the storefront
 *   words the shipment «پس‌کرایه» whatever its amount.
 * - freight on request: the option only says "ask me"; the backend refuses to
 *   put it on a cart, and the answered price is minted as a separate option.
 *
 * Both are stored with a zero price (an option with no price at all fails when
 * added to a cart), and the backend refuses any other amount.
 */
export function isUnpricedShippingType(code?: string | null) {
  return code === FREIGHT_COLLECT_TYPE_CODE || code === FREIGHT_QUOTE_TYPE_CODE
}

/** Whether a producer may pick this type for an option of their own. */
export function isSelectableShippingType(code?: string | null) {
  return code !== QUOTE_FREIGHT_TYPE_CODE
}

/** The only prices an unpriced option is stored with. */
export function unpricedShippingPrices(currencyCode: string) {
  return [{ currency_code: currencyCode, amount: 0 }]
}

export function isSameLocation(
  shippingOption: HttpTypes.AdminShippingOption,
  locationId: string
) {
  return (
    shippingOption?.service_zone?.fulfillment_set?.location?.id === locationId
  )
}

export function getFormattedShippingOptionLocationName(
  shippingOption: HttpTypes.AdminShippingOption
) {
  const location = shippingOption.service_zone.fulfillment_set.location

  if (!location) {
    return "N/A"
  }

  if (location.name) {
    return `${location.name}`
  }

  let name = ""

  if (location.address) {
    if (location.address.address_1) {
      name += `${location.address.address_1}`
    }

    if (location.address.address_2) {
      name += `${location.address.address_2}`
    }

    if (location.address.city) {
      name += `${location.address.city}`
    }

    if (location.address.postal_code) {
      name += `${location.address.postal_code}`
    }

    if (location.address.country_code) {
      name += `, ${location.address.country_code}`
    }
  }

  return name || "N/A"
}
