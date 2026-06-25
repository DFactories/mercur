import { defineLink } from "@medusajs/framework/utils"
import FulfillmentModule from "@medusajs/medusa/fulfillment"

import ShippingOptionTypeDeliveryModule from "../modules/shipping-option-type-delivery"

// Read-only field link: shipping_option_type.id === delivery.shipping_option_type_id.
// Exposes the admin-curated delivery info as `shipping_option_type.delivery`
// (single). No link table — resolved by the foreign field, like the
// order-line-item ↔ commission_line link.
export default defineLink(
  {
    linkable: FulfillmentModule.linkable.shippingOptionType,
    field: "id",
  },
  {
    ...ShippingOptionTypeDeliveryModule.linkable.shippingOptionTypeDelivery.id,
    alias: "delivery",
    primaryKey: "shipping_option_type_id",
  },
  {
    readOnly: true,
  }
)
