import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MercurModules } from "@mercurjs/types"

import OfferModuleService from "../../../modules/offer/service"

export const deleteOfferDraftsStep = createStep(
  "delete-offer-drafts",
  async (input: { ids: string[] }, { container }) => {
    if (!input.ids.length) {
      return new StepResponse(void 0, [] as string[])
    }
    const service = container.resolve<OfferModuleService>(MercurModules.OFFER)
    await service.softDeleteOfferDrafts(input.ids)
    return new StepResponse(void 0, input.ids)
  },
  async (ids: string[] | undefined, { container }) => {
    if (!ids?.length) {
      return
    }
    const service = container.resolve<OfferModuleService>(MercurModules.OFFER)
    await service.restoreOfferDrafts(ids)
  }
)
