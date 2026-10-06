import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"

import { reconcileProductVariantAxesStep } from "../steps"

export const reconcileProductVariantAxesWorkflowId =
  "reconcile-product-variant-axes"

export const reconcileProductVariantAxesWorkflow = createWorkflow(
  reconcileProductVariantAxesWorkflowId,
  function (input: { product_id: string }) {
    reconcileProductVariantAxesStep(input)

    return new WorkflowResponse(void 0)
  },
)
