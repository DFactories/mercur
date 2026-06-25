import { MedusaService } from "@medusajs/framework/utils"

import ShippingOptionTypeDelivery from "./models/shipping-option-type-delivery"

class ShippingOptionTypeDeliveryModuleService extends MedusaService({
  ShippingOptionTypeDelivery,
}) {}

export default ShippingOptionTypeDeliveryModuleService
