import {
  DeleteResponse,
  PaginatedResponse,
  ShippingProfileDTO,
} from "@medusajs/types"

export type VendorShippingProfile = ShippingProfileDTO & {
  /**
   * How many of the requesting seller's offered products ship from this
   * profile (by the offer's profile) — the number that decides whether a
   * buyer can choose a shipping option placed here. Only the retrieve route
   * computes it.
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
