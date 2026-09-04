import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * How many of a seller's goods sit on each shipping profile.
 *
 * Two choices here are the whole point of the file:
 *
 * 1. "A seller's goods" is the products its OFFERS point at, not the products
 *    its panel can see. A vendor's product list also carries every published
 *    master product, and those never reach a cart under this seller.
 *
 * 2. The profile read is the PRODUCT's, never the offer's. `create-offers`
 *    links a product to the FIRST offer's profile and skips it forever after
 *    (the product↔profile link is one-to-one), so an offer's own
 *    `shipping_profile_id` can differ from the profile the cart is actually
 *    culled against — see `workflows/cart/utils/shipping-profile-parity`.
 *    Counting the offer's profile would report coverage the buyer never gets.
 *
 * Both reads are bounded rather than paginated: offers per seller and profiles
 * per marketplace are small, and the same 10000 ceiling is what the profile
 * list route already uses.
 */
export const getSellerShippingProfileGoodsCounts = async (
  scope: MedusaContainer,
  sellerId: string
): Promise<Map<string, number>> => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: offers } = await query.graph({
    entity: "offer",
    fields: ["product_id"],
    filters: { seller_id: sellerId },
    pagination: { skip: 0, take: 10000 },
  })

  const productIds = Array.from(
    new Set(
      (offers as { product_id?: string | null }[])
        .map((offer) => offer.product_id)
        .filter((id): id is string => !!id)
    )
  )

  const counts = new Map<string, number>()

  if (!productIds.length) {
    return counts
  }

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "shipping_profile.id"],
    filters: { id: productIds },
    pagination: { skip: 0, take: productIds.length },
  })

  for (const product of products as {
    shipping_profile?: { id?: string | null } | null
  }[]) {
    const profileId = product.shipping_profile?.id
    if (!profileId) {
      continue
    }
    counts.set(profileId, (counts.get(profileId) ?? 0) + 1)
  }

  return counts
}

export const getSellerShippingProfileGoodsCount = async (
  scope: MedusaContainer,
  sellerId: string,
  shippingProfileId: string
): Promise<number> => {
  const counts = await getSellerShippingProfileGoodsCounts(scope, sellerId)
  return counts.get(shippingProfileId) ?? 0
}
