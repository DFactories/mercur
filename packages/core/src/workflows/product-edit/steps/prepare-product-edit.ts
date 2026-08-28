import {
  ContainerRegistrationKeys,
  isDefined,
  MedusaError,
} from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import {
  MercurModules,
  ProductChangeStatus,
  ProductStatus,
} from "@mercurjs/types"

import type ProductChangeModuleService from "../../../modules/product-edit/service"
import { pendingProductChangeError } from "./validate-no-pending-product-change"

export const prepareProductEditStepId = "pc-prepare-product-edit"

/**
 * Statuses of a product nobody can buy yet. The approval queue protects what
 * the storefront shows; a product in one of these statuses shows nothing, and a
 * `proposed` one is reviewed as a whole when an operator confirms it — so an
 * edit to it has nothing to wait for and is applied as it is made.
 */
export const UNPUBLISHED_PRODUCT_STATUSES: readonly string[] = [
  ProductStatus.DRAFT,
  ProductStatus.PROPOSED,
  ProductStatus.REJECTED,
]

export const isUnpublishedProductStatus = (status?: string | null) =>
  !!status && UNPUBLISHED_PRODUCT_STATUSES.includes(status)

export type PrepareProductEditStepInput = {
  product_id: string
  canceled_by?: string
  /**
   * The actor making the edit. When set, only THEIR pending request blocks an
   * edit to a published product — the same scoping as
   * `validateNoPendingProductChangeStep` (upstream #1443): on a shared master
   * product one seller's open request must not lock out another's.
   */
  created_by?: string | null
}

export type PrepareProductEditStepOutput = {
  /** Apply the change now instead of queueing it for an operator. */
  direct: boolean
  /** Pending changes this edit superseded (and canceled). */
  superseded_change_ids: string[]
}

type PrevChangeScalar = {
  id: string
  status: ProductChangeStatus
  canceled_by: string | null
  canceled_at: Date | null
}

type PendingChange = PrevChangeScalar & { created_by?: string | null }

/**
 * Decides how a vendor edit to one product is recorded, before it is staged:
 *
 * - **published** — queued for approval, and refused while the same actor's
 *   earlier request is still open.
 * - **unpublished** — applied directly. Any request still pending from before
 *   (the queue used to catch these too) is canceled first: left open, an
 *   operator approving it later would write its stale values over this edit.
 *
 * The cancellation is compensated, so a failure later in the workflow leaves
 * the old request pending as it was.
 */
export const prepareProductEditStep = createStep(
  prepareProductEditStepId,
  async (input: PrepareProductEditStepInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    const {
      data: [product],
    } = await query.graph({
      entity: "product",
      fields: ["id", "status"],
      filters: { id: input.product_id },
    })

    if (!product) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Product with id ${input.product_id} was not found`,
      )
    }

    const { data: pending } = (await query.graph({
      entity: "product_change",
      fields: ["id", "status", "canceled_by", "canceled_at", "created_by"],
      filters: {
        product_id: input.product_id,
        status: ProductChangeStatus.PENDING,
      },
    })) as { data: PendingChange[] }

    if (!isUnpublishedProductStatus(product.status as string)) {
      const blocking = isDefined(input.created_by)
        ? pending.filter((change) => change.created_by === input.created_by)
        : pending

      if (blocking.length) {
        throw pendingProductChangeError()
      }

      return new StepResponse<PrepareProductEditStepOutput, PrevChangeScalar[]>(
        { direct: false, superseded_change_ids: [] },
        [],
      )
    }

    if (!pending.length) {
      return new StepResponse<PrepareProductEditStepOutput, PrevChangeScalar[]>(
        { direct: true, superseded_change_ids: [] },
        [],
      )
    }

    const service = container.resolve<ProductChangeModuleService>(
      MercurModules.PRODUCT_EDIT,
    )

    const canceledAt = new Date()
    await service.updateProductChanges(
      pending.map((change) => ({
        id: change.id,
        status: ProductChangeStatus.CANCELED,
        canceled_by: input.canceled_by ?? null,
        canceled_at: canceledAt,
      })),
    )

    return new StepResponse<PrepareProductEditStepOutput, PrevChangeScalar[]>(
      {
        direct: true,
        superseded_change_ids: pending.map((change) => change.id),
      },
      pending.map((change) => ({
        id: change.id,
        status: change.status,
        canceled_by: change.canceled_by ?? null,
        canceled_at: change.canceled_at ?? null,
      })),
    )
  },
  async (prev: PrevChangeScalar[] | undefined, { container }) => {
    if (!prev?.length) {
      return
    }

    const service = container.resolve<ProductChangeModuleService>(
      MercurModules.PRODUCT_EDIT,
    )
    await service.updateProductChanges(prev)
  },
)
