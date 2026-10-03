import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ProductEvents } from "@medusajs/framework/utils"
import { MercurModules } from "@mercurjs/types"

import OfferModuleService from "../modules/offer/service"

/**
 * A draft on a deleted product or variant can never be completed, and left in
 * place it would keep showing the seller work they cannot do.
 */
export default async function offerDraftCatalogueDeletedHandler({
  event,
  container,
}: SubscriberArgs<{ id?: string; ids?: string[] }>) {
  const ids = event.data.ids ?? (event.data.id ? [event.data.id] : [])
  if (!ids.length) {
    return
  }

  const service = container.resolve<OfferModuleService>(MercurModules.OFFER)
  const drafts = await service.listOfferDrafts(
    event.name === ProductEvents.PRODUCT_DELETED
      ? { product_id: ids }
      : { variant_id: ids },
    { select: ["id"] }
  )
  if (drafts.length) {
    await service.softDeleteOfferDrafts(drafts.map((draft) => draft.id))
  }
}

export const config: SubscriberConfig = {
  event: [ProductEvents.PRODUCT_DELETED, ProductEvents.PRODUCT_VARIANT_DELETED],
  context: {
    subscriberId: "offer-draft-catalogue-deleted",
  },
}
