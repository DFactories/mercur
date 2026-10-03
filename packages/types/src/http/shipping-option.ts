import {
  DeleteResponse,
  PaginatedResponse,
  ShippingOptionDTO,
  ShippingOptionRuleDTO,
} from "@medusajs/types"

/**
 * Non-blocking notice that a shipping option sits on a shipping profile none of
 * the seller's own offers ship from. The write still succeeds — a producer may
 * legitimately create the option first and move offers onto the profile after —
 * but a buyer choosing this carriage is refused (checkout matches it against
 * each line's offer profile), so the response says so where the person who can
 * fix it will see it.
 */
export interface VendorShippingOptionProfileWarning {
  code: "shipping_profile_carries_no_goods"
  shipping_profile_id: string
  /** The seller's offered products on that profile. Always 0 when present. */
  seller_product_count: number
  message: string
}

export interface VendorShippingOptionResponse {
  /**
   * The shipping option's details.
   */
  shipping_option: ShippingOptionDTO
  /**
   * Present only when the option's shipping profile carries none of this
   * seller's goods.
   */
  warning?: VendorShippingOptionProfileWarning
}

export type VendorShippingOptionListResponse = PaginatedResponse<{
  /**
   * The list of shipping options.
   */
  shipping_options: ShippingOptionDTO[]
}>

export type VendorShippingOptionDeleteResponse = DeleteResponse<"shipping_option">

export interface VendorUpdateShippingOptionRulesResponse {
  /**
   * The created shipping option rules.
   */
  created: ShippingOptionRuleDTO[]
  /**
   * The updated shipping option rules.
   */
  updated: ShippingOptionRuleDTO[]
  /**
   * The deleted shipping option rules.
   */
  deleted: {
    ids: string[]
    object: "shipping_option_rule"
    deleted: boolean
  }
}

export interface StoreSellerShippingOptionsResponse {
  /**
   * The shipping options grouped by seller ID.
   */
  shipping_options: Record<string, ShippingOptionDTO[]>
}
