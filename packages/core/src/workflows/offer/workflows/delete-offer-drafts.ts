import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"

import { deleteOfferDraftsStep } from "../steps/delete-offer-drafts"

export const deleteOfferDraftsWorkflowId = "delete-offer-drafts"

export const deleteOfferDraftsWorkflow = createWorkflow(
  deleteOfferDraftsWorkflowId,
  function (input: { ids: string[] }) {
    deleteOfferDraftsStep(input)
    return new WorkflowResponse(void 0)
  }
)
