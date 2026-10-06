import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  CreateProductChangeActionDTO,
  MercurModules,
  ProductChangeStatus,
} from "@mercurjs/types"

import type ProductChangeModuleService from "../../../modules/product-edit/service"

export const appendProductChangeActionsStepId =
  "pc-append-product-change-actions"

/**
 * Message key the panels translate. An operator may confirm or reject the
 * request between the moment the edit was prepared and this step; the edit must
 * then be saved again as a new request rather than land in a closed one.
 */
export const REQUEST_JUST_REVIEWED_MESSAGE = "apiErrors.product.requestJustReviewed"

export type AppendProductChangeActionsStepInput = {
  change_id: string
  actions: Omit<CreateProductChangeActionDTO, "product_change_id">[]
}

export const appendProductChangeActionsStep = createStep(
  appendProductChangeActionsStepId,
  async (input: AppendProductChangeActionsStepInput, { container }) => {
    const service = container.resolve<ProductChangeModuleService>(
      MercurModules.PRODUCT_EDIT,
    )

    const [change] = await service.listProductChanges(
      { id: input.change_id },
      { select: ["id", "status"] },
    )

    if (!change || change.status !== ProductChangeStatus.PENDING) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        REQUEST_JUST_REVIEWED_MESSAGE,
      )
    }

    if (!input.actions.length) {
      return new StepResponse([], [])
    }

    const created = await service.createProductChangeActions(
      input.actions.map((action) => ({
        ...action,
        product_change_id: input.change_id,
      })),
    )

    return new StepResponse(
      created,
      created.map((action) => action.id),
    )
  },
  async (ids: string[] | undefined, { container }) => {
    if (!ids?.length) {
      return
    }
    const service = container.resolve<ProductChangeModuleService>(
      MercurModules.PRODUCT_EDIT,
    )
    await service.deleteProductChangeActions(ids)
  },
)
