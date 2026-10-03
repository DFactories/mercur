import { defineLink } from "@medusajs/framework/utils"
import SellerModule from "../modules/seller"
import OfferModule from "../modules/offer"

export default defineLink(
  {
    linkable: OfferModule.linkable.offerDraft,
    field: "seller_id",
  },
  SellerModule.linkable.seller,
  {
    readOnly: true,
  }
)
