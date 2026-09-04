import {
  DeleteResponse,
  PaginatedResponse,
  ShippingProfileDTO,
} from "@medusajs/types"

export type VendorShippingProfile = ShippingProfileDTO & {
  /**
   * How many of the requesting seller's goods sit on this profile — the number
   * that decides whether a shipping option placed here will survive a
   * multi-seller cart. Only the retrieve route computes it.
   */
  seller_product_count?: number
}

export interface VendorShippingProfileResponse {
  /**
   * The shipping profile's details.
   */
  shipping_profile: VendorShippingProfile
}

export type VendorShippingProfileListResponse = PaginatedResponse<{
  /**
   * The list of shipping profiles.
   */
  shipping_profiles: ShippingProfileDTO[]
}>

export type VendorShippingProfileDeleteResponse = DeleteResponse<"shipping_profile">
