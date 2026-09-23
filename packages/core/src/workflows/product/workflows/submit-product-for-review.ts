import {
  createHook,
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { FeatureFlag, ProductStatus } from "@medusajs/framework/utils"
import {
  emitEventStep,
  updateProductsStep,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows"
import { MercurFeatureFlags, ProductChangeActionType } from "@mercurjs/types"
import { AdditionalData } from "@medusajs/framework/types"

import { ProductWorkflowEvents } from "../events"
import { validateProductsStatusStep } from "../steps/validate-products-status"
import { recordProductAuditChangeWorkflow } from "../../product-edit/workflows/record-product-audit-change"
import { prepareProductEditWorkflow } from "../../product-edit/workflows/prepare-product-edit"

export const submitProductForReviewWorkflowId =
  "mercur-submit-product-for-review"

type SubmitProductForReviewWorkflowInput = {
  product_id: string
  actor_id?: string
} & AdditionalData

/**
 * A vendor hands a `draft` (never submitted) or `rejected` (sent back) product
 * to the operators: it becomes `proposed` and joins the product-request queue,
 * the same place a product submitted at creation lands. Without the approval
 * flow there is nobody to wait for, so it is published instead — which is what
 * the create form does in that mode too.
 *
 * Any edit request still pending on the product from before is canceled on the
 * way: the operator reviews the product as it now stands.
 */
export const submitProductForReviewWorkflow = createWorkflow(
  submitProductForReviewWorkflowId,
  function (input: SubmitProductForReviewWorkflowInput) {
    const { data: products } = useQueryGraphStep({
      entity: "product",
      fields: ["id", "status"],
      filters: { id: input.product_id },
      options: { throwIfKeyNotFound: true },
    }).config({ name: "get-product" })

    validateProductsStatusStep({
      products,
      expected_status: [ProductStatus.DRAFT, ProductStatus.REJECTED],
    })

    prepareProductEditWorkflow.runAsStep({
      input: transform({ input }, ({ input }) => ({
        product_id: input.product_id,
        canceled_by: input.actor_id,
      })),
    })

    const status = transform({ input }, () =>
      FeatureFlag.isFeatureEnabled(MercurFeatureFlags.PRODUCT_REQUEST)
        ? ProductStatus.PROPOSED
        : ProductStatus.PUBLISHED,
    )

    recordProductAuditChangeWorkflow.runAsStep({
      input: transform(
        { input, products, status },
        ({ input, products, status }) => ({
          actor_id: input.actor_id,
          changes: [
            {
              product_id: input.product_id,
              actions: [
                {
                  product_id: input.product_id,
                  action: ProductChangeActionType.STATUS_CHANGE,
                  details: {
                    status,
                    previous_status: products[0]?.status,
                  },
                },
              ],
            },
          ],
        }),
      ),
    })

    updateProductsStep(
      transform({ input, status }, ({ input, status }) => ({
        selector: { id: input.product_id },
        update: { status },
      })),
    )

    const submitted = transform({ input, status }, ({ input, status }) => ({
      id: input.product_id,
      status,
    }))

    emitEventStep({
      eventName: ProductWorkflowEvents.SUBMITTED,
      data: submitted,
    })

    const productSubmitted = createHook("productSubmitted", {
      product_id: input.product_id,
      status,
      additional_data: input.additional_data,
    })

    return new WorkflowResponse(submitted, { hooks: [productSubmitted] })
  },
)
