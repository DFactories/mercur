import { model } from "@medusajs/framework/utils"

/**
 * Admin-curated delivery metadata for a Medusa `shipping_option_type`.
 *
 * `shipping_option_type` is owned by @medusajs/fulfillment and has no metadata
 * field, so this small linked model carries the per-type delivery info. One row
 * per type (unique `shipping_option_type_id`); linked back to the type as
 * `shipping_option_type.delivery` via a read-only module link.
 *
 * Consumed by the shipping-templates flow: when a vendor picks a type for a
 * shipping option, its `estimated_delivery_days` is stamped onto the option's
 * metadata, which the settlement hold uses to floor the return window.
 */
const ShippingOptionTypeDelivery = model
  .define("shipping_option_type_delivery", {
    id: model.id().primaryKey(),
    /** The fulfillment `shipping_option_type` this delivery info belongs to. */
    shipping_option_type_id: model.text(),
    /** Estimated delivery time in whole days (null = unset → falls back). */
    estimated_delivery_days: model.number().nullable(),
    /** Optional carrier/courier label (e.g. "post", "tipax"). */
    carrier: model.text().nullable(),
  })
  .indexes([
    {
      name: "IDX_sotype_delivery_type_id",
      on: ["shipping_option_type_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])

export default ShippingOptionTypeDelivery
