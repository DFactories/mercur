import { MedusaContainer } from "@medusajs/framework/types"
import {
  buildPriceListRules,
  buildPriceSetPricesForCore,
  ContainerRegistrationKeys,
  MedusaError,
  promiseAll,
} from "@medusajs/framework/utils"

type SellerPriceListPriceInput = {
  variant_id: string
  rules?: Record<string, string>
}

type SellerOffer = { id: string; variant_id: string }

export const validateSellerPriceList = async (
  scope: MedusaContainer,
  sellerId: string,
  priceListId: string
) => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [sellerPriceList],
  } = await query.graph({
    entity: "price_list_seller",
    filters: {
      seller_id: sellerId,
      price_list_id: priceListId,
    },
    fields: ["seller_id", "price_list_id"],
  })

  if (!sellerPriceList) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Price list with id: ${priceListId} was not found`
    )
  }
}

/**
 * Pins every price to one of the seller's own offers on the price's variant.
 *
 * All offers on a variant share its price set, and only the `offer_id` price
 * rule tells their rows apart. Medusa matches a price without rules in any
 * context and ranks price-list rows first, so an unpinned price-list price
 * would reprice every other seller's offer on the same variant. A price that
 * names no offer gets the seller's offer on that variant; a price that names
 * someone else's offer, or a variant the seller does not sell, is refused.
 */
export const scopePricesToSellerOffers = async <
  T extends SellerPriceListPriceInput,
>(
  scope: MedusaContainer,
  sellerId: string,
  prices: T[]
): Promise<T[]> => {
  if (!prices.length) {
    return prices
  }

  const query = scope.resolve(ContainerRegistrationKeys.QUERY)

  const variantIds = [...new Set(prices.map((price) => price.variant_id))]
  const namedOfferIds = [
    ...new Set(
      prices
        .map((price) => price.rules?.offer_id)
        .filter((id): id is string => !!id)
    ),
  ]

  const [{ data: offersOnVariants }, { data: namedOffers }] = await promiseAll([
    query.graph({
      entity: "offer",
      fields: ["id", "variant_id"],
      filters: { seller_id: sellerId, variant_id: variantIds },
    }),
    namedOfferIds.length
      ? query.graph({
          entity: "offer",
          fields: ["id", "variant_id"],
          filters: { seller_id: sellerId, id: namedOfferIds },
        })
      : Promise.resolve({ data: [] as SellerOffer[] }),
  ])

  const offersByVariant = new Map<string, SellerOffer[]>()
  for (const offer of offersOnVariants as SellerOffer[]) {
    const list = offersByVariant.get(offer.variant_id) ?? []
    list.push(offer)
    offersByVariant.set(offer.variant_id, list)
  }
  const namedOffersById = new Map(
    (namedOffers as SellerOffer[]).map((offer) => [offer.id, offer])
  )

  return prices.map((price) => {
    const namedOfferId = price.rules?.offer_id
    let offerId: string

    if (namedOfferId) {
      const offer = namedOffersById.get(namedOfferId)
      if (!offer) {
        throw new MedusaError(
          MedusaError.Types.NOT_FOUND,
          `Offer with id: ${namedOfferId} was not found`
        )
      }
      if (offer.variant_id !== price.variant_id) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Offer ${namedOfferId} does not sell variant ${price.variant_id}`
        )
      }
      offerId = offer.id
    } else {
      const offers = offersByVariant.get(price.variant_id) ?? []
      if (!offers.length) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `You have no offer on variant ${price.variant_id}. A price-list price applies to one of your offers.`
        )
      }
      if (offers.length > 1) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `You have more than one offer on variant ${price.variant_id}. Set rules.offer_id to choose one.`
        )
      }
      offerId = offers[0].id
    }

    return { ...price, rules: { ...(price.rules ?? {}), offer_id: offerId } }
  })
}

/**
 * Loads prices by id that sit in this price list, and refuses any id that does
 * not. Medusa's update and delete steps read prices by id alone, so without
 * this a seller could rewrite or delete any price through its own list.
 */
export const fetchPriceListPricesById = async (
  scope: MedusaContainer,
  priceListId: string,
  priceIds: string[]
) => {
  if (!priceIds.length) {
    return []
  }

  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: prices } = await query.graph({
    entity: "price",
    fields: ["id", "price_rules.attribute", "price_rules.value"],
    filters: { id: priceIds, price_list_id: priceListId },
  })

  const found = new Set(prices.map((price: { id: string }) => price.id))
  const missing = [...new Set(priceIds)].filter((id) => !found.has(id))
  if (missing.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Prices with ids: ${missing.join(", ")} were not found in price list ${priceListId}`
    )
  }

  return prices as {
    id: string
    price_rules?: { attribute: string; value: string }[]
  }[]
}

/**
 * Prepares price-list price updates: each id must be in the list, and the row
 * is re-pinned to the seller's offer. An update that sends no rules keeps the
 * row's other rules but not its `offer_id`, so an old unpinned row (or one
 * pinned to an offer that is not the seller's) is pinned when it is saved.
 */
export const scopePriceUpdatesToSellerOffers = async <
  T extends SellerPriceListPriceInput & { id: string },
>(
  scope: MedusaContainer,
  sellerId: string,
  priceListId: string,
  updates: T[]
): Promise<T[]> => {
  if (!updates.length) {
    return updates
  }

  const existing = await fetchPriceListPricesById(
    scope,
    priceListId,
    updates.map((update) => update.id)
  )
  const existingRulesById = new Map(
    existing.map((price) => [
      price.id,
      Object.fromEntries(
        (price.price_rules ?? []).map((rule) => [rule.attribute, rule.value])
      ),
    ])
  )

  const withRules = updates.map((update) => {
    if (update.rules) {
      return update
    }
    const { offer_id: _offerId, ...rules } =
      existingRulesById.get(update.id) ?? {}
    return { ...update, rules }
  })

  return scopePricesToSellerOffers(scope, sellerId, withRules)
}

export const fetchPriceList = async (
  id: string,
  scope: MedusaContainer,
  fields: string[]
) => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [priceList],
  } = await query.graph({
    entity: "price_list",
    fields,
    filters: { id },
  })

  if (!priceList) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Price list with id: ${id} was not found`
    )
  }

  return transformPriceList(priceList)
}

export const transformPriceList = (priceList: any) => {
  if (priceList.price_list_rules) {
    priceList.rules = buildPriceListRules(priceList.price_list_rules)
    delete priceList.price_list_rules
  }

  if (priceList.prices) {
    priceList.prices = buildPriceSetPricesForCore(priceList.prices)
  }

  return priceList
}

export const fetchPriceListPriceIdsForProduct = async (
  priceListId: string,
  productIds: string[],
  scope: MedusaContainer
): Promise<string[]> => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: variants } = await query.graph({
    entity: "product_variant",
    filters: { product_id: productIds },
    fields: ["price_set.id"],
  })

  const priceSetIds: string[] = []
  for (const variant of variants) {
    if ((variant as any).price_set?.id) {
      priceSetIds.push((variant as any).price_set.id)
    }
  }

  if (!priceSetIds.length) {
    return []
  }

  const { data: productPrices } = await query.graph({
    entity: "price",
    filters: {
      price_set_id: priceSetIds,
      price_list_id: priceListId,
    },
    fields: ["id"],
  })

  return productPrices.map((price: any) => price.id)
}
