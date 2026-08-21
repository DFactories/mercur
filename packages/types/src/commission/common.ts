import { BigNumberInput } from "@medusajs/types"

export enum CommissionRateType {
  FIXED = "fixed",
  PERCENTAGE = "percentage",
}

export type CommissionRuleDTO = {
  id: string
  reference: string
  reference_id: string
  commission_rate_id: string
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export type CommissionRateValueDTO = {
  id: string
  currency_code: string
  amount: number
  commission_rate_id: string
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export type CommissionLineDTO = {
  id: string
  item_id: string | null
  shipping_method_id: string | null
  commission_rate_id: string | null
  code: string
  rate: number
  amount: number
  description: string | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export type CommissionRateDTO = {
  id: string
  name: string
  code: string
  type: CommissionRateType
  value: number
  currency_code: string | null
  include_tax: boolean
  include_shipping: boolean
  is_enabled: boolean
  is_default: boolean
  rules?: CommissionRuleDTO[]
  values?: CommissionRateValueDTO[]
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export interface CommissionCalculationItemLine {
  /**
   * The ID of the item line.
   */
  id: string

  /**
   * The subtotal of the line item (base amount for commission calculation).
   */
  subtotal: BigNumberInput

  /**
   * The tax total of the line item (used when include_tax is true).
   */
  tax_total?: BigNumberInput

  /**
   * The part of this line's discount that the marketplace absorbs, derived from
   * the promotion's `cost_bearer`. It is subtracted from the subtotal before the
   * rate applies, so commission is charged on what the seller actually keeps.
   *
   * `marketplace` puts the whole discount here (base becomes the post-discount
   * amount), `store` puts none of it here (the seller absorbs it, the marketplace
   * is made whole), and `shared` puts the marketplace's declared percentage here.
   * Absent, the line is treated as undiscounted.
   */
  marketplace_borne_discount?: BigNumberInput

  /**
   * The product of the line item.
   */
  product?: {
    id: string
    collection_id?: string
    tags?: { id: string }[]
    categories?: { id: string }[]
    type_id?: string
    seller?: { id: string }
  }
}

export interface CommissionCalculationShippingLine {
  /**
   * The ID of the shipping method.
   */
  id: string

  /**
   * The subtotal of the shipping method.
   */
  subtotal: BigNumberInput

  /**
   * The tax total of the shipping method (used when include_tax is true).
   */
  tax_total?: BigNumberInput

  /**
   * The part of this line's discount that the marketplace absorbs, derived from
   * the promotion's `cost_bearer`. It is subtracted from the subtotal before the
   * rate applies, so commission is charged on what the seller actually keeps.
   *
   * `marketplace` puts the whole discount here (base becomes the post-discount
   * amount), `store` puts none of it here (the seller absorbs it, the marketplace
   * is made whole), and `shared` puts the marketplace's declared percentage here.
   * Absent, the line is treated as undiscounted.
   */
  marketplace_borne_discount?: BigNumberInput
}

export interface CommissionCalculationContext {
  /**
   * The cart's currency
   */
  currency_code: string

  /**
   * The cart's line items.
   */
  items?: CommissionCalculationItemLine[]

  /**
   * The cart's shipping methods.
   */
  shipping_methods?: CommissionCalculationShippingLine[]
}

export interface CreateCommissionLineDTO {
  item_id?: string | null
  shipping_method_id?: string | null
  commission_rate_id: string
  code: string
  rate: number
  amount: number
  description?: string | null
}

export interface UpdateCommissionLineDTO extends Partial<CreateCommissionLineDTO> {
  id: string
}
