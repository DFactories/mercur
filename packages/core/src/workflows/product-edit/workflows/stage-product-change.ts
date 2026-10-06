import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  acquireLockStep,
  emitEventStep,
  releaseLockStep,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows"
import {
  CreateProductChangeActionDTO,
  ProductChangeDTO,
  ProductChangeStatus,
} from "@mercurjs/types"

import { ProductChangeWorkflowEvents } from "../events"
import {
  appendProductChangeActionsStep,
  createProductChangeActionsStep,
  createProductChangesStep,
} from "../steps"
import { productChangeLockKey } from "../utils/product-change-lock"
import { autoConfirmProductChangeWorkflow } from "./auto-confirm-product-change"

export type StageProductChangeWorkflowInput = {
  product_id: string
  created_by?: string
  actions: Array<
    Omit<CreateProductChangeActionDTO, "product_change_id">
  >
  internal_note?: string
  external_note?: string
  auto_confirm?: boolean
  /**
   * The actor's open request on this product. When set the actions are added
   * to it instead of opening a second request.
   */
  existing_change_id?: string | null
}

export const stageProductChangeWorkflowId = "stage-product-change"

export const stageProductChangeWorkflow = createWorkflow(
  stageProductChangeWorkflowId,
  function (input: StageProductChangeWorkflowInput) {
    const createdChangeId = when(
      "stage-create-product-change",
      { input },
      ({ input }) => !input.existing_change_id,
    ).then(() => {
      const changes = createProductChangesStep(
        transform({ input }, ({ input }) => [
          {
            product_id: input.product_id,
            created_by: input.created_by,
            status: ProductChangeStatus.PENDING,
            internal_note: input.internal_note,
            external_note: input.external_note,
          },
        ]),
      )

      const stampedActions = transform(
        { input, changes },
        ({ input, changes }) => {
          const product_change_id = changes[0]?.id as string
          return input.actions.map(
            (a) =>
              ({
                ...a,
                product_change_id,
              }) as CreateProductChangeActionDTO,
          )
        },
      )

      createProductChangeActionsStep(stampedActions)

      emitEventStep({
        eventName: ProductChangeWorkflowEvents.CREATED,
        data: transform({ changes }, ({ changes }) => ({
          id: changes[0]?.id,
        })),
      }).config({ name: "emit-product-change-created" })

      return transform({ changes }, ({ changes }) => changes[0]?.id as string)
    })

    const appendedActions = when(
      "stage-append-product-change",
      { input },
      ({ input }) => !!input.existing_change_id,
    ).then(() => {
      const lockKey = transform({ input }, ({ input }) =>
        productChangeLockKey(input.existing_change_id as string),
      )

      acquireLockStep({ key: lockKey, timeout: 10, ttl: 30 })

      const appended = appendProductChangeActionsStep(
        transform({ input }, ({ input }) => ({
          change_id: input.existing_change_id as string,
          actions: input.actions,
        })),
      )

      releaseLockStep({ key: lockKey })

      return appended
    })

    when(
      "stage-emit-product-change-updated",
      { input, appendedActions },
      ({ input, appendedActions }) =>
        !!input.existing_change_id && !!appendedActions?.length,
    ).then(() => {
      emitEventStep({
        eventName: ProductChangeWorkflowEvents.UPDATED,
        data: transform(
          { input, appendedActions },
          ({ input, appendedActions }) => ({
            id: input.existing_change_id,
            action_ids: (appendedActions ?? []).map(
              (action: { id: string }) => action.id,
            ),
          }),
        ),
      }).config({ name: "emit-product-change-updated" })
    })

    const changeId = transform(
      { input, createdChangeId },
      ({ input, createdChangeId }) =>
        (input.existing_change_id ?? createdChangeId) as string,
    )

    autoConfirmProductChangeWorkflow.runAsStep({
      input: transform({ changeId, input }, ({ changeId, input }) => ({
        change_id: changeId,
        confirmed_by: input.created_by,
        force: !input.existing_change_id && !!input.auto_confirm,
      })),
    })

    const { data: changes } = useQueryGraphStep({
      entity: "product_change",
      fields: ["*"],
      filters: transform({ changeId }, ({ changeId }) => ({ id: changeId })),
    }).config({ name: "stage-load-product-change" })

    return new WorkflowResponse(
      transform(
        { changes },
        ({ changes }) => changes[0] as unknown as ProductChangeDTO,
      ),
    )
  },
)
