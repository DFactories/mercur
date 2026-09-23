import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { ProductChangeStatus } from "@mercurjs/types"

export const validateNoPendingProductChangeStepId =
  "pc-validate-no-pending-product-change"

/**
 * The sentence every "a request is already open" refusal carries. The vendor
 * panel recognises it by this exact text, so it is a contract: change it here
 * and in the panel's `product-change-errors` together.
 *
 * NOT_ALLOWED (400), not CONFLICT: Medusa's error handler replaces the message
 * of every CONFLICT with a generic idempotency-key sentence, which would throw
 * away the one thing the producer needs to read.
 */
export const PENDING_PRODUCT_CHANGE_ERROR_MESSAGE =
  "There is already an active update request for this product. Only one request can be active at a time."

export const pendingProductChangeError = () =>
  new MedusaError(
    MedusaError.Types.NOT_ALLOWED,
    PENDING_PRODUCT_CHANGE_ERROR_MESSAGE,
  )

type ValidateNoPendingProductChangeStepInput = {
  product_ids: string[]
}

export const validateNoPendingProductChangeStep = createStep(
  validateNoPendingProductChangeStepId,
  async (
    { product_ids }: ValidateNoPendingProductChangeStepInput,
    { container },
  ) => {
    if (!product_ids.length) {
      return new StepResponse(void 0)
    }

    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    // Filtered in the database: the table holds every change ever made to
    // every product, and loading all of it to find one pending row grows
    // without bound.
    const { data: changes } = await query.graph({
      entity: "product_change",
      fields: ["id"],
      filters: {
        product_id: product_ids,
        status: ProductChangeStatus.PENDING,
      },
      pagination: { take: 1 },
    })

    if (changes.length) {
      throw pendingProductChangeError()
    }

    return new StepResponse(void 0)
  },
)
