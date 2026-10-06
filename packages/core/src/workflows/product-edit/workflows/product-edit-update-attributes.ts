import { AdditionalData } from "@medusajs/framework/types"
import {
  createHook,
  createWorkflow,
  type Hook,
  type ReturnWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { useQueryGraphStep } from "@medusajs/medusa/core-flows"
import {
  AttributeType,
  CreateProductChangeActionDTO,
  ProductAttributeBatchAdd,
  ProductAttributeBatchUpdate,
  ProductChangeActionType,
  ProductChangeDTO,
} from "@mercurjs/types"

import { validateVariantAxesDetachableStep } from "../../product-attribute/steps"
import { prepareProductEditWorkflow } from "./prepare-product-edit"
import { stageProductChangeWorkflow } from "./stage-product-change"

export type ProductEditUpdateAttributesWorkflowInput = {
  product_id: string
  created_by?: string
  add?: ProductAttributeBatchAdd[]
  remove?: string[]
  update?: ProductAttributeBatchUpdate[]
} & AdditionalData

export type ProductEditUpdateAttributesWorkflowHooks = [
  Hook<
    "productChangeCreated",
    {
      product_change: ProductChangeDTO
      additional_data: Record<string, unknown> | undefined
    },
    unknown
  >,
]

export const productEditUpdateAttributesWorkflowId =
  "product-edit-update-attributes"

export const productEditUpdateAttributesWorkflow: ReturnWorkflow<
  ProductEditUpdateAttributesWorkflowInput,
  ProductChangeDTO,
  ProductEditUpdateAttributesWorkflowHooks
> = createWorkflow(
  productEditUpdateAttributesWorkflowId,
  function (input: ProductEditUpdateAttributesWorkflowInput) {
    const editMode = prepareProductEditWorkflow.runAsStep({
      input: transform({ input }, ({ input }) => ({
        product_id: input.product_id,
        canceled_by: input.created_by,
        created_by: input.created_by,
      })),
    })

    const removedIds = transform({ input }, ({ input }) => {
      const readded = new Set(
        (input.add ?? [])
          .map((a) => ("id" in a ? a.id : undefined))
          .filter((id): id is string => !!id),
      )
      return (input.remove ?? []).filter((id) => !readded.has(id))
    })

    const { data: removedAttributes } = useQueryGraphStep({
      entity: "product_attribute",
      fields: ["id", "type", "is_variant_axis", "product_option_id"],
      filters: { id: removedIds },
    }).config({ name: "pc-load-removed-attributes" })

    validateVariantAxesDetachableStep(
      transform(
        { input, removedAttributes },
        ({ input, removedAttributes }) => ({
          product_id: input.product_id,
          product_option_ids: (
            (removedAttributes ?? []) as {
              type: AttributeType
              is_variant_axis: boolean
              product_option_id: string | null
            }[]
          )
            .filter(
              (a) =>
                a.type === AttributeType.MULTI_SELECT &&
                a.is_variant_axis &&
                !!a.product_option_id,
            )
            .map((a) => a.product_option_id as string),
        }),
      ),
    )

    const actions = transform({ input }, ({ input }) => {
      const acts: Array<
        Omit<CreateProductChangeActionDTO, "product_change_id">
      > = []

      for (const attribute of input.add ?? []) {
        acts.push({
          product_id: input.product_id,
          action: ProductChangeActionType.ATTRIBUTE_ADD,
          details: { attribute },
        })
      }

      for (const attribute_id of input.remove ?? []) {
        acts.push({
          product_id: input.product_id,
          action: ProductChangeActionType.ATTRIBUTE_REMOVE,
          details: { attribute_id },
        })
      }

      for (const update of input.update ?? []) {
        acts.push({
          product_id: input.product_id,
          action: ProductChangeActionType.ATTRIBUTE_UPDATE,
          details: { update },
        })
      }

      return acts
    })

    const change = stageProductChangeWorkflow.runAsStep({
      input: transform(
        { input, actions, editMode },
        ({ input, actions, editMode }) => ({
          product_id: input.product_id,
          created_by: input.created_by,
          actions,
          auto_confirm: editMode.direct,
          existing_change_id: editMode.existing_change_id,
        }),
      ),
    })

    const productChangeCreated = createHook("productChangeCreated", {
      product_change: change,
      additional_data: input.additional_data,
    })

    return new WorkflowResponse(change, {
      hooks: [productChangeCreated],
    })
  },
)
