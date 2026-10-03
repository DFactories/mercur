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
 * The statuses in which creator attribution decides who sees a product.
 *
 * Attribution exists so a seller sees its own not-yet-published submissions;
 * it carries no rights once the product is published, where the allowlist
 * alone decides (upstream #1552). `rejected` stays with its creator here,
 * unlike upstream, because a rejected product is edited and resubmitted.
 */
export const CREATOR_VISIBLE_STATUSES: ProductStatus[] = [
  ProductStatus.DRAFT,
  ProductStatus.PROPOSED,
  ProductStatus.REJECTED,
]

/**
 * The subset of `productIds` a seller may reach — exactly what
 * `GET /vendor/products` lists to it: its own unpublished submissions, plus
 * every published product that is unrestricted or restricted to a set of
 * sellers that includes it.
 *
 * One rule for every vendor route that takes a product (or a variant of one),
 * so reading, editing and offering can never disagree with the list.
 */
export const getProductIdsAccessibleToSeller = async (
  scope: MedusaContainer,
  sellerId: string,
  productIds: string[]
): Promise<Set<string>> => {
  const accessible = new Set<string>()
  if (!productIds.length) {
    return accessible
  }

  const query = scope.resolve(ContainerRegistrationKeys.QUERY)

  const [{ data: products }, { data: links }, { data: authored }] =
    await promiseAll([
      query.graph({
        entity: "product",
        fields: ["id", "status"],
        filters: { id: productIds },
      }),
      query.graph({
        entity: "product_seller",
        fields: ["product_id", "seller_id"],
        filters: { product_id: productIds },
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

  const createdBySeller = new Set(
    (authored as { product_id?: string | null }[])
      .map((row) => row.product_id)
      .filter((id): id is string => !!id)
  )

  const allowlists = new Map<string, Set<string>>()
  for (const link of links as {
    product_id?: string | null
    seller_id?: string | null
  }[]) {
    if (!link.product_id || !link.seller_id) {
      continue
    }
    const sellers = allowlists.get(link.product_id) ?? new Set<string>()
    sellers.add(link.seller_id)
    allowlists.set(link.product_id, sellers)
  }

  for (const product of products as { id: string; status: string }[]) {
    if (product.status === ProductStatus.PUBLISHED) {
      const allowlist = allowlists.get(product.id)
      if (!allowlist || allowlist.has(sellerId)) {
        accessible.add(product.id)
      }
      continue
    }

    if (
      createdBySeller.has(product.id) &&
      CREATOR_VISIBLE_STATUSES.includes(product.status as ProductStatus)
    ) {
      accessible.add(product.id)
    }
  }

  return accessible
}

/**
 * Which product a seller may reach under `/vendor/products/:id` — to read it
 * or to file a change against it. See {@link getProductIdsAccessibleToSeller};
 * everything else answers 404.
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
  const accessible = await getProductIdsAccessibleToSeller(scope, sellerId, [
    productId,
  ])

  if (!accessible.has(productId)) {
    throw productNotFound(productId)
  }
}

/**
 * A seller may open an offer only on a variant of a product it can reach.
 *
 * `product_seller` is the selling allowlist, and until this check only the
 * product LIST honoured it: the offer routes took any `variant_id`, so a store
 * could sell on a product restricted to another store, or on another store's
 * unpublished draft. A variant that does not exist and a variant the seller may
 * not see answer the same 404, so the check reveals nothing about either.
 */
export const ensureSellerCanOfferOnVariants = async (
  scope: MedusaContainer,
  sellerId: string,
  variantIds: string[]
): Promise<void> => {
  const ids = Array.from(new Set(variantIds.filter(Boolean)))
  if (!ids.length) {
    return
  }

  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "product_id"],
    filters: { id: ids },
  })

  const productIdByVariant = new Map(
    (variants as { id: string; product_id?: string | null }[]).map((v) => [
      v.id,
      v.product_id ?? null,
    ])
  )

  const accessible = await getProductIdsAccessibleToSeller(
    scope,
    sellerId,
    Array.from(
      new Set(
        Array.from(productIdByVariant.values()).filter(
          (id): id is string => !!id
        )
      )
    )
  )

  const refused = ids.find((id) => {
    const productId = productIdByVariant.get(id)
    return !productId || !accessible.has(productId)
  })

  if (refused) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Product variant with id ${refused} was not found`
    )
  }
}
