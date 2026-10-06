import {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { ProductChangeStatus } from "@mercurjs/types"

type PendingAwareRequest = MedusaRequest & {
  filterableFields: Record<string, unknown>
  seller_context?: { seller_id?: string }
}

/**
 * A store sees only its own open requests; the admin sees every store's.
 */
const pendingChangesFilter = (productIds: string[] | null, sellerId?: string) => ({
  status: ProductChangeStatus.PENDING,
  ...(productIds ? { product_id: productIds } : {}),
  ...(sellerId ? { created_by: sellerId } : {}),
})

/**
 * `?has_pending_change=true` narrows a products list to those with an edit
 * awaiting review — the one thing an operator opening a "product edit"
 * notification needs to find.
 */
export const applyPendingChangeFilter = async (
  req: PendingAwareRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) => {
  req.filterableFields ??= {}
  const hasPending = req.filterableFields.has_pending_change
  delete req.filterableFields.has_pending_change

  if (hasPending !== true) {
    return next()
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: changes } = await query.graph({
    entity: "product_change",
    fields: ["product_id"],
    filters: pendingChangesFilter(null, req.seller_context?.seller_id),
  })

  const productIds = Array.from(
    new Set((changes as { product_id: string }[]).map((c) => c.product_id))
  )

  const existingAnd = (req.filterableFields.$and as object[] | undefined) ?? []
  req.filterableFields.$and = [
    ...existingAnd,
    { id: productIds.length ? productIds : ["__none__"] },
  ]

  return next()
}

/**
 * Sets `pending_change` on each listed product: the open request's id, or
 * null. One query for the page, so the lists can mark those rows.
 */
export const annotatePendingChanges = async (
  scope: MedusaContainer,
  products: { id: string; pending_change?: { id: string } | null }[],
  sellerId?: string
) => {
  if (!products.length) {
    return
  }

  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: changes } = await query.graph({
    entity: "product_change",
    fields: ["id", "product_id"],
    filters: pendingChangesFilter(
      products.map((p) => p.id),
      sellerId
    ),
  })

  const byProduct = new Map(
    (changes as { id: string; product_id: string }[]).map((c) => [
      c.product_id,
      c.id,
    ])
  )

  for (const product of products) {
    const changeId = byProduct.get(product.id)
    product.pending_change = changeId ? { id: changeId } : null
  }
}
