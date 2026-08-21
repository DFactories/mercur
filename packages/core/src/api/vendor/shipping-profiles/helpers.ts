import { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

export const refetchShippingProfile = async (
  scope: MedusaContainer,
  shippingProfileId: string,
  fields: string[]
) => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [shippingProfile],
  } = await query.graph({
    entity: "shipping_profile",
    filters: { id: shippingProfileId },
    fields,
  })

  return shippingProfile
}

export const validateSellerShippingProfile = async (
  scope: MedusaContainer,
  sellerId: string,
  shippingProfileId: string
) => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [sellerShippingProfile],
  } = await query.graph({
    entity: "shipping_profile_seller",
    filters: {
      seller_id: sellerId,
      shipping_profile_id: shippingProfileId,
    },
    fields: ["seller_id"],
  })

  if (!sellerShippingProfile) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Shipping profile with id: ${shippingProfileId} was not found`
    )
  }
}

/**
 * Like {@link validateSellerShippingProfile} but ALSO allows a global,
 * admin-curated profile (one with no seller link at all) — used for read-only
 * access (the [id] GET) so a vendor can view a global profile it can select but
 * not own. A profile owned by ANOTHER seller stays hidden (NOT_FOUND). Writes
 * (update/delete) keep using the stricter owner-only check.
 */
export const validateSellerOrGlobalShippingProfile = async (
  scope: MedusaContainer,
  sellerId: string,
  shippingProfileId: string
) => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)

  // The profile must actually exist (a deleted one is soft-deleted, so
  // query.graph returns nothing → NOT_FOUND, matching the owner-only check).
  const {
    data: [profile],
  } = await query.graph({
    entity: "shipping_profile",
    filters: { id: shippingProfileId },
    fields: ["id"],
  })

  const { data: links } = await query.graph({
    entity: "shipping_profile_seller",
    filters: { shipping_profile_id: shippingProfileId },
    fields: ["seller_id"],
  })

  const ownedBySomeone = links.length > 0
  const ownedByMe = links.some((l) => l.seller_id === sellerId)

  // Allow ONLY an existing profile that is either the seller's own or a global
  // (unowned) one. A missing profile or one owned by another seller → NOT_FOUND.
  if (!profile || (ownedBySomeone && !ownedByMe)) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Shipping profile with id: ${shippingProfileId} was not found`
    )
  }
}
