import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
  type ReturnWorkflow,
} from "@medusajs/framework/workflows-sdk"
import {
  createProductVariantsWorkflow,
  deleteProductsWorkflow,
  deleteProductVariantsWorkflow,
  updateProductsWorkflow,
  updateProductVariantsWorkflow,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows"
import {
  ProductAttributeBatchAdd,
  ProductAttributeBatchUpdate,
  ProductChangeActionType,
} from "@mercurjs/types"

import {
  applyVariantImageLinksStep,
  checkOfferedRemovalsStep,
  updateProductChangeActionsStep,
  type VariantImageLinks,
} from "../steps"
import { deleteOffersWorkflow } from "../../offer/workflows/delete-offers"
import {
  collapseProductChangeActions,
  type CollapsibleProductChangeAction,
} from "../utils/collapse-product-change-actions"
import { applyProductAttributeChangeActionsWorkflow } from "./apply-product-attribute-change-actions"

export type ApplyProductChangeActionsWorkflowInput = {
  change_ids: string[]
}

type BucketedActions = {
  productUpdates: Array<Record<string, unknown> & { id: string }>
  variantCreates: Array<Record<string, unknown> & { product_id: string }>
  variantUpdates: Array<Record<string, unknown> & { id: string }>
  variantImageLinks: VariantImageLinks[]
  variantDeletes: string[]
  variantRemovals: Array<{ variant_id: string; requested_by: string | null }>
  attributeBatch: {
    product_id: string
    add: ProductAttributeBatchAdd[]
    remove: string[]
    update: ProductAttributeBatchUpdate[]
  } | null
  productsToDelete: string[]
  productRemovals: Array<{ product_id: string; requested_by: string | null }>
  pendingActionIds: string[]
}

const HANDLED_ACTION_TYPES = new Set<string>([
  ProductChangeActionType.STATUS_CHANGE,
  ProductChangeActionType.UPDATE,
  ProductChangeActionType.VARIANT_ADD,
  ProductChangeActionType.VARIANT_UPDATE,
  ProductChangeActionType.VARIANT_REMOVE,
  ProductChangeActionType.ATTRIBUTE_ADD,
  ProductChangeActionType.ATTRIBUTE_REMOVE,
  ProductChangeActionType.ATTRIBUTE_UPDATE,
  ProductChangeActionType.PRODUCT_DELETE,
])

export const applyProductChangeActionsWorkflowId =
  "apply-product-change-actions"

export const applyProductChangeActionsWorkflow: ReturnWorkflow<
  ApplyProductChangeActionsWorkflowInput,
  void,
  []
> = createWorkflow(
  applyProductChangeActionsWorkflowId,
  function (input: ApplyProductChangeActionsWorkflowInput) {
    const { data: actions } = useQueryGraphStep({
      entity: "product_change_action",
      fields: [
        "id",
        "product_id",
        "action",
        "details",
        "applied",
        "ordering",
        "created_at",
        "product_change_id",
      ],
      filters: {
        product_change_id: input.change_ids,
        applied: false,
      },
    }).config({ name: "pc-load-pending-actions" })

    const { data: changes } = useQueryGraphStep({
      entity: "product_change",
      fields: ["id", "created_by"],
      filters: { id: input.change_ids },
    }).config({ name: "pc-load-change-requesters" })

    const buckets = transform(
      { actions, changes },
      ({ actions, changes }): BucketedActions => {
      const requesterByChange = new Map<string, string | null>(
        (changes ?? []).map((c) => [
          c.id as string,
          (c.created_by as string | null) ?? null,
        ]),
      )
      const productUpdatesById = new Map<
        string,
        Record<string, unknown> & { id: string }
      >()
      const variantCreates: Array<
        Record<string, unknown> & { product_id: string }
      > = []
      const variantUpdates: Array<Record<string, unknown> & { id: string }> = []
      const variantImageLinks: VariantImageLinks[] = []
      const variantDeletes: string[] = []
      let attributeBatch: BucketedActions["attributeBatch"] = null
      const ensureAttributeBatch = (productId: string) => {
        attributeBatch ??= {
          product_id: productId,
          add: [],
          remove: [],
          update: [],
        }
        return attributeBatch
      }
      const productsToDelete = new Set<string>()
      const pendingActionIds: string[] = []

      const unapplied = (actions ?? []).filter(
        (action) =>
          !!action &&
          !action.applied &&
          // Types this workflow cannot act on keep `applied: false` — stamping
          // them would assert an application that never happened.
          HANDLED_ACTION_TYPES.has(action.action as string),
      ) as CollapsibleProductChangeAction[]

      pendingActionIds.push(...unapplied.map((action) => action.id))

      for (const action of collapseProductChangeActions(unapplied)) {

        const productId = action.product_id as string
        const details = (action.details ?? {}) as Record<string, unknown>

        switch (action.action) {
          case ProductChangeActionType.STATUS_CHANGE: {
            const status = (details as { status?: string }).status
            if (status === undefined) break
            const u = productUpdatesById.get(productId) ?? { id: productId }
            u.status = status
            productUpdatesById.set(productId, u)
            break
          }
          case ProductChangeActionType.UPDATE: {
            const { field, value } = details as {
              field?: string
              value?: unknown
            }
            if (!field) break
            const u = productUpdatesById.get(productId) ?? { id: productId }
            u[field] = value
            productUpdatesById.set(productId, u)
            break
          }
          case ProductChangeActionType.VARIANT_ADD: {
            const variant = (
              details as { variant?: Record<string, unknown> }
            ).variant
            if (!variant) break
            variantCreates.push({ ...variant, product_id: productId })
            break
          }
          case ProductChangeActionType.VARIANT_UPDATE: {
            const { variant_id, fields } = details as {
              variant_id?: string
              fields?: Record<string, unknown>
            }
            if (
              !variant_id ||
              !fields ||
              !Object.keys(fields as object).length
            )
              break
            const { images, ...scalarFields } = fields as {
              images?: { add?: string[]; remove?: string[] }
            } & Record<string, unknown>
            const add = images?.add ?? []
            const remove = images?.remove ?? []
            if (add.length || remove.length) {
              variantImageLinks.push({ variant_id, add, remove })
            }
            if (Object.keys(scalarFields).length) {
              variantUpdates.push({ id: variant_id, ...scalarFields })
            }
            break
          }
          case ProductChangeActionType.VARIANT_REMOVE: {
            const variantId = (details as { variant_id?: string }).variant_id
            if (variantId) variantDeletes.push(variantId)
            break
          }
          case ProductChangeActionType.ATTRIBUTE_ADD: {
            const attribute = (
              details as { attribute?: ProductAttributeBatchAdd }
            ).attribute
            if (!attribute) break
            ensureAttributeBatch(productId).add.push(attribute)
            break
          }
          case ProductChangeActionType.ATTRIBUTE_REMOVE: {
            const attributeId = (details as { attribute_id?: string })
              .attribute_id
            if (!attributeId) break
            ensureAttributeBatch(productId).remove.push(attributeId)
            break
          }
          case ProductChangeActionType.ATTRIBUTE_UPDATE: {
            const update = (
              details as { update?: ProductAttributeBatchUpdate }
            ).update
            if (!update) break
            ensureAttributeBatch(productId).update.push(update)
            break
          }
          case ProductChangeActionType.PRODUCT_DELETE: {
            productsToDelete.add(productId)
            break
          }
        }
      }

      const requesterOf = (
        matches: (action: CollapsibleProductChangeAction) => boolean,
      ) => {
        const source = unapplied.find(matches) as
          | (CollapsibleProductChangeAction & { product_change_id?: string })
          | undefined
        return source?.product_change_id
          ? (requesterByChange.get(source.product_change_id) ?? null)
          : null
      }

      return {
        productUpdates: Array.from(productUpdatesById.values()).filter(
          (u) => Object.keys(u).length > 1,
        ),
        variantCreates,
        variantUpdates,
        variantImageLinks,
        variantDeletes,
        variantRemovals: variantDeletes.map((variant_id) => ({
          variant_id,
          requested_by: requesterOf(
            (a) =>
              a.action === ProductChangeActionType.VARIANT_REMOVE &&
              a.details?.variant_id === variant_id,
          ),
        })),
        attributeBatch,
        productsToDelete: Array.from(productsToDelete),
        productRemovals: Array.from(productsToDelete).map((product_id) => ({
          product_id,
          requested_by: requesterOf(
            (a) =>
              a.action === ProductChangeActionType.PRODUCT_DELETE &&
              a.product_id === product_id,
          ),
        })),
        pendingActionIds,
      }
      },
    )

    const removals = checkOfferedRemovalsStep(
      transform({ buckets }, ({ buckets }) => ({
        variants: buckets.variantRemovals,
        products: buckets.productRemovals,
      })),
    )

    when(
      "close-removed-offers-when",
      { removals },
      ({ removals }) => removals.offer_ids.length > 0,
    ).then(() => {
      deleteOffersWorkflow.runAsStep({
        input: transform({ removals }, ({ removals }) => ({
          ids: removals.offer_ids,
        })),
      })
    })

    when({ buckets }, ({ buckets }) => buckets.productUpdates.length > 0).then(
      () => {
        updateProductsWorkflow.runAsStep({
          input: transform({ buckets }, ({ buckets }) => ({
            products: buckets.productUpdates as never,
          })),
        })
      },
    )

    when({ buckets }, ({ buckets }) => buckets.variantDeletes.length > 0).then(
      () => {
        deleteProductVariantsWorkflow.runAsStep({
          input: transform({ buckets }, ({ buckets }) => ({
            ids: buckets.variantDeletes,
          })),
        })
      },
    )

    when({ buckets }, ({ buckets }) => buckets.variantCreates.length > 0).then(
      () => {
        createProductVariantsWorkflow.runAsStep({
          input: transform({ buckets }, ({ buckets }) => ({
            product_variants: buckets.variantCreates as never,
          })),
        })
      },
    )

    when({ buckets }, ({ buckets }) => buckets.variantUpdates.length > 0).then(
      () => {
        updateProductVariantsWorkflow.runAsStep({
          input: transform({ buckets }, ({ buckets }) => ({
            product_variants: buckets.variantUpdates as never,
          })),
        })
      },
    )

    when(
      { buckets },
      ({ buckets }) => buckets.variantImageLinks.length > 0,
    ).then(() => {
      applyVariantImageLinksStep({
        updates: transform(
          { buckets },
          ({ buckets }) => buckets.variantImageLinks,
        ),
      })
    })

    applyProductAttributeChangeActionsWorkflow.runAsStep({
      input: transform({ buckets }, ({ buckets }) => ({
        product_id: buckets.attributeBatch?.product_id ?? "",
        add: buckets.attributeBatch?.add ?? [],
        remove: buckets.attributeBatch?.remove ?? [],
        update: buckets.attributeBatch?.update ?? [],
      })),
    })

    when(
      "delete-products-when",
      { buckets },
      ({ buckets }) => buckets.productsToDelete.length > 0,
    ).then(() => {
      deleteProductsWorkflow.runAsStep({
        input: transform({ buckets }, ({ buckets }) => ({
          ids: buckets.productsToDelete,
        })),
      })
    })

    when(
      { buckets },
      ({ buckets }) => buckets.pendingActionIds.length > 0,
    ).then(() => {
      updateProductChangeActionsStep(
        transform({ buckets }, ({ buckets }) =>
          buckets.pendingActionIds.map((id) => ({ id, applied: true })),
        ),
      )
    })

    return new WorkflowResponse(void 0)
  },
)
