import {
  ContainerRegistrationKeys,
  MedusaError,
  promiseAll,
} from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ProductChangeActionType, ProductStatus } from "@mercurjs/types"

export const getSellerOwnedProductIds = async (
  scope: MedusaContainer,
  sellerId: string
): Promise<string[]> => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: actions } = await query.graph({
    entity: "product_change_action",
    fields: ["product_id"],
    filters: {
      action: ProductChangeActionType.PRODUCT_ADD,
      product_change: { created_by: sellerId },
    },
  })

  return actions
    .map(action => action.product_id)
}

/**
 * Product ids that are restricted (have at least one `product_seller` row) but
 * NOT assigned to this seller — i.e. restricted to other sellers, so they must
 * be hidden from this seller's product list.
 */
export const getProductIdsRestrictedFromSeller = async (
  scope: MedusaContainer,
  sellerId: string
): Promise<string[]> => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: links } = await query.graph({
    entity: "product_seller",
    fields: ["product_id", "seller_id"],
  })

  const assigned = new Set<string>()
  const restricted = new Set<string>()
  for (const link of links as {
    product_id: string | null
    seller_id: string | null
  }[]) {
    if (!link.product_id) {
      continue
    }
    restricted.add(link.product_id)
    if (link.seller_id === sellerId) {
      assigned.add(link.product_id)
    }
  }

  return Array.from(restricted).filter((id) => !assigned.has(id))
}

/**
 * The subset of `productIds` this seller manages: one it is assigned to
 * (product_seller eligibility) OR one it created (master-product authoring).
 * Both lookups are narrowed to the ids asked about.
 */
export const getProductIdsManagedBySeller = async (
  scope: MedusaContainer,
  sellerId: string,
  productIds: string[]
): Promise<Set<string>> => {
  if (!productIds.length) {
    return new Set()
  }

  const query = scope.resolve(ContainerRegistrationKeys.QUERY)

  const [{ data: links }, { data: authored }] = await promiseAll([
    query.graph({
      entity: "product_seller",
      fields: ["product_id"],
      filters: { seller_id: sellerId, product_id: productIds },
    }),
    query.graph({
      entity: "product_change_action",
      fields: ["product_id"],
      filters: {
        action: ProductChangeActionType.PRODUCT_ADD,
        product_id: productIds,
        product_change: { created_by: sellerId },
      },
    }),
  ])

  const managed = new Set<string>()
  for (const row of [...links, ...authored] as { product_id?: string | null }[]) {
    if (row.product_id) {
      managed.add(row.product_id)
    }
  }
  return managed
}

const productNotFound = (productId: string) =>
  new MedusaError(
    MedusaError.Types.NOT_FOUND,
    `Product with id ${productId} was not found`
  )

export const ensureSellerOwnsProduct = async (
  scope: MedusaContainer,
  sellerId: string,
  productIds: string[]
): Promise<void> => {
  if (!productIds.length) {
    return
  }

  const managed = await getProductIdsManagedBySeller(
    scope,
    sellerId,
    productIds
  )
  const missingProductId = productIds.find((id) => !managed.has(id))

  if (missingProductId) {
    throw productNotFound(missingProductId)
  }
}

/**
 * Which product a seller may reach under `/vendor/products/:id` — to read it
 * or to file a change against it. The same rule as the list: its own products
 * whatever their status, and anybody's PUBLISHED product unless it is
 * restricted to other sellers. Everything else answers 404.
 *
 * Reaching a published master product it did not create lets a seller REQUEST
 * a change (the shared catalog is edited that way, and the request waits for
 * an operator). What it can never reach is another store's unpublished
 * product: those are the ones edited and deleted directly, and the routes used
 * to accept any id — one store could delete another's draft.
 */
export const ensureSellerCanAccessProduct = async (
  scope: MedusaContainer,
  sellerId: string,
  productId: string
): Promise<void> => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)

  const [
    {
      data: [product],
    },
    managed,
    { data: links },
  ] = await promiseAll([
    query.graph({
      entity: "product",
      fields: ["id", "status"],
      filters: { id: productId },
    }),
    getProductIdsManagedBySeller(scope, sellerId, [productId]),
    query.graph({
      entity: "product_seller",
      fields: ["seller_id"],
      filters: { product_id: productId },
    }),
  ])

  if (!product) {
    throw productNotFound(productId)
  }

  if (managed.has(productId)) {
    return
  }

  const restrictedToOthers = (links as { seller_id?: string | null }[]).length > 0
  if (product.status !== ProductStatus.PUBLISHED || restrictedToOthers) {
    throw productNotFound(productId)
  }
}
