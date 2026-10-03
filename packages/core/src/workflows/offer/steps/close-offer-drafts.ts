import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MercurModules } from "@mercurjs/types"

import OfferModuleService from "../../../modules/offer/service"
import { CreatedOfferRef } from "../../../modules/offer/offer-draft-rules"

/**
 * A new offer closes the drafts it covers, whichever route created it — the
 * vendor's create form, the admin batch, an import — so completing a draft
 * needs no route of its own and copies none of the offer checks.
 */
export const closeOfferDraftsStep = createStep(
  "close-offer-drafts",
  async (offers: CreatedOfferRef[], { container }) => {
    if (!offers.length) {
      return new StepResponse(void 0, [] as string[])
    }
    const service = container.resolve<OfferModuleService>(MercurModules.OFFER)
    const closed = await service.closeOfferDrafts(offers)
    return new StepResponse(void 0, closed)
  },
  async (closed: string[] | undefined, { container }) => {
    if (!closed?.length) {
      return
    }
    const service = container.resolve<OfferModuleService>(MercurModules.OFFER)
    await service.reopenOfferDrafts(closed)
  }
)
