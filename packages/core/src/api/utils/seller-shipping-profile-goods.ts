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
 * 2. The profile read is the OFFER's, never the product's — the same profile
 *    checkout matches a carriage against (`validateSellerCartShippingStep`,
 *    upstream #1417; `workflows/cart/utils/shipping-profile-parity`). The
 *    product↔profile link is one-to-one and the FIRST offerer wins it, so on a
 *    shared master product the product's profile says nothing about where a
 *    second seller ships from. (This counted the product's profile while
 *    Medusa's orphan-profile cull read it; Mercur now disables that cull.)
 *
 * A product is counted once per profile however many of its variants the
 * seller offers there.
 *
 * Bounded rather than paginated: offers per seller are small, and the same
 * 10000 ceiling is what the profile list route already uses.
 */
export const getSellerShippingProfileGoodsCounts = async (
  scope: MedusaContainer,
  sellerId: string
): Promise<Map<string, number>> => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: offers } = await query.graph({
    entity: "offer",
    fields: ["product_id", "shipping_profile_id"],
    filters: { seller_id: sellerId },
    pagination: { skip: 0, take: 10000 },
  })

  const productsByProfile = new Map<string, Set<string>>()

  for (const offer of offers as {
    product_id?: string | null
    shipping_profile_id?: string | null
  }[]) {
    if (!offer.product_id || !offer.shipping_profile_id) {
      continue
    }

    const products =
      productsByProfile.get(offer.shipping_profile_id) ?? new Set<string>()
    products.add(offer.product_id)
    productsByProfile.set(offer.shipping_profile_id, products)
  }

  return new Map(
    Array.from(productsByProfile, ([profileId, products]) => [
      profileId,
      products.size,
    ])
  )
}

export const getSellerShippingProfileGoodsCount = async (
  scope: MedusaContainer,
  sellerId: string,
  shippingProfileId: string
): Promise<number> => {
  const counts = await getSellerShippingProfileGoodsCounts(scope, sellerId)
  return counts.get(shippingProfileId) ?? 0
}
