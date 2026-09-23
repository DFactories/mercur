import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
  type ReturnWorkflow,
} from "@medusajs/framework/workflows-sdk"
import { emitEventStep } from "@medusajs/medusa/core-flows"

import { ProductChangeWorkflowEvents } from "../events"
import {
  prepareProductEditStep,
  type PrepareProductEditStepInput,
  type PrepareProductEditStepOutput,
} from "../steps"

export type PrepareProductEditWorkflowInput = PrepareProductEditStepInput

export const prepareProductEditWorkflowId = "prepare-product-edit"

/**
 * Runs {@link prepareProductEditStep} and announces every pending change it
 * superseded, the same way an explicit cancel does. Every vendor edit
 * workflow starts here.
 */
export const prepareProductEditWorkflow: ReturnWorkflow<
  PrepareProductEditWorkflowInput,
  PrepareProductEditStepOutput,
  []
> = createWorkflow(
  prepareProductEditWorkflowId,
  function (input: PrepareProductEditWorkflowInput) {
    const mode = prepareProductEditStep(input)

    when(
      { mode },
      ({ mode }) => mode.superseded_change_ids.length > 0,
    ).then(() => {
      emitEventStep({
        eventName: ProductChangeWorkflowEvents.CANCELED,
        data: transform({ mode }, ({ mode }) =>
          mode.superseded_change_ids.map((id) => ({ id })),
        ),
      }).config({ name: "emit-superseded-product-changes" })
    })

    return new WorkflowResponse(mode)
  },
)
