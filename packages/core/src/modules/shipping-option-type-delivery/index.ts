import { Module } from "@medusajs/framework/utils"

import ShippingOptionTypeDeliveryModuleService from "./service"

export const SHIPPING_OPTION_TYPE_DELIVERY_MODULE =
  "shipping_option_type_delivery"

export { ShippingOptionTypeDeliveryModuleService }

export default Module(SHIPPING_OPTION_TYPE_DELIVERY_MODULE, {
  service: ShippingOptionTypeDeliveryModuleService,
})
