import { AdditionalData } from "@medusajs/framework/types"
import {
  createWorkflow,
  transform,
  WorkflowResponse,
  type ReturnWorkflow,
} from "@medusajs/framework/workflows-sdk"
import {
  ProductChangeActionType,
  ProductChangeDTO,
} from "@mercurjs/types"

import { prepareProductEditWorkflow } from "./prepare-product-edit"
import { stageProductChangeWorkflow } from "./stage-product-change"

export type ProductEditDeleteProductWorkflowInput = {
  product_id: string
  created_by?: string
} & AdditionalData

export const productEditDeleteProductWorkflowId =
  "product-edit-delete-product"

export const productEditDeleteProductWorkflow: ReturnWorkflow<
  ProductEditDeleteProductWorkflowInput,
  ProductChangeDTO,
  []
> = createWorkflow(
  productEditDeleteProductWorkflowId,
  function (input: ProductEditDeleteProductWorkflowInput) {
    // An unpublished product is deleted on the spot, whatever request is
    // still open on it: that request is canceled with it. Only a published
    // product's delete waits for an operator.
    const editMode = prepareProductEditWorkflow.runAsStep({
      input: transform({ input }, ({ input }) => ({
        product_id: input.product_id,
        canceled_by: input.created_by,
      })),
    })

    const change = stageProductChangeWorkflow.runAsStep({
      input: transform({ input, editMode }, ({ input, editMode }) => ({
        product_id: input.product_id,
        created_by: input.created_by,
        auto_confirm: editMode.direct,
        actions: [
          {
            product_id: input.product_id,
            action: ProductChangeActionType.PRODUCT_DELETE,
            details: {},
          },
        ],
      })),
    })

    return new WorkflowResponse(change)
  },
)
