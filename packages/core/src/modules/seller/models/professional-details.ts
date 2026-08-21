import { model } from "@medusajs/framework/utils"
import Seller from "./seller"

const ProfessionalDetails = model.define("ProfessionalDetails", {
  id: model.id({ prefix: "selprodet" }).primaryKey(),
  corporate_name: model.text().nullable(),
  registration_number: model.text().nullable(),
  tax_id: model.text().nullable(),
  // Uploaded store documents (file URLs): business activity license + health permit.
  business_license: model.text().nullable(),
  health_permit: model.text().nullable(),
  seller: model.belongsTo(() => Seller, {
    mappedBy: "professional_details",
  }),
})

export default ProfessionalDetails
