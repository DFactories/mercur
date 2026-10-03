import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"

import {
  createOfferDraftsStep,
  type CreateOfferDraftsStepInput,
} from "../steps/create-offer-drafts"

export const createOfferDraftsWorkflowId = "create-offer-drafts"

export const createOfferDraftsWorkflow = createWorkflow(
  createOfferDraftsWorkflowId,
  function (input: CreateOfferDraftsStepInput) {
    return new WorkflowResponse(createOfferDraftsStep(input))
  }
)
