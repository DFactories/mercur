import {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaResponse,
  MiddlewareRoute,
} from "@medusajs/framework/http"
import {
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework"
import { ProductStatus } from "@mercurjs/types"

import {
  applyDigitInsensitiveSearch,
  applyOfferedProductsFilter,
  applyPendingChangeFilter,
} from "../../utils"
import {
  CREATOR_VISIBLE_STATUSES,
  ensureSellerCanAccessProduct,
  getProductIdsRestrictedFromSeller,
  getSellerUnpublishedProductIds,
} from "./helpers"
import {
  vendorProductQueryConfig,
  vendorProductVariantQueryConfig,
} from "./query-config"
import {
  VendorAddProductVariant,
  VendorBatchProductAttributes,
  VendorCancelProductChange,
  VendorCreateProduct,
  VendorGetProductParams,
  VendorGetProductsParams,
  VendorGetProductVariantParams,
  VendorGetProductVariantsParams,
  VendorUpdateProduct,
  VendorUpdateProductVariant,
} from "./validators"
import { ContainerRegistrationKeys, promiseAll } from "@medusajs/framework/utils"

const applySellerProductLinkFilter = async (
  req: AuthenticatedMedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) => {
  const sellerId = req.seller_context!.seller_id

  const [ownProductIds, restrictedFromSellerIds] = await promiseAll([
    getSellerUnpublishedProductIds(req.scope, sellerId),
    getProductIdsRestrictedFromSeller(req.scope, sellerId),
  ])

  req.filterableFields ??= {}
  const existingAnd = (req.filterableFields.$and as object[] | undefined) ?? []
  req.filterableFields.$and = [
    ...existingAnd,
    {
      $or: [
        // Attribution (or an operator's assignment) only covers unpublished
        // products; a published product is shared and the allowlist alone
        // decides (upstream #1552).
        {
          id: ownProductIds,
          status: { $in: CREATOR_VISIBLE_STATUSES },
        },
        {
          status: ProductStatus.PUBLISHED,
          id: { $nin: restrictedFromSellerIds },
        },
      ],
    },
  ]

  return next()
}

/**
 * `mine=true`: the products this store registered — created by it, or created
 * for it by an operator — and the ones it sells, through an offer or an open
 * offer draft. The panel turns it on by default (decided 2026-10-07): every
 * store sees the whole shared catalogue, and its own work was lost in it.
 */
const applyMineProductsFilter = async (
  req: AuthenticatedMedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) => {
  req.filterableFields ??= {}
  const mine = req.filterableFields.mine
  delete req.filterableFields.mine

  if (mine !== true) {
    return next()
  }

  const sellerId = req.seller_context!.seller_id
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const [registered, { data: offers }, { data: drafts }] = await promiseAll([
    getSellerUnpublishedProductIds(req.scope, sellerId),
    query.graph({
      entity: "offer",
      fields: ["variant_id"],
      filters: { seller_id: sellerId },
    }),
    query.graph({
      entity: "offer_draft",
      fields: ["product_id"],
      filters: { seller_id: sellerId, status: "open" },
    }),
  ])

  const variantIds = Array.from(
    new Set(
      (offers as { variant_id: string | null }[])
        .map((offer) => offer.variant_id)
        .filter((id): id is string => !!id)
    )
  )
  const productIds = Array.from(
    new Set([
      ...registered,
      ...(drafts as { product_id: string }[]).map((d) => d.product_id),
    ])
  )

  const existingAnd = (req.filterableFields.$and as object[] | undefined) ?? []
  req.filterableFields.$and = [
    ...existingAnd,
    {
      $or: [
        { id: productIds.length ? productIds : ["__none__"] },
        { variants: { id: variantIds.length ? variantIds : ["__none__"] } },
      ],
    },
  ]

  return next()
}

/** See {@link ensureSellerCanAccessProduct}. */
const ensureSellerCanAccess = async (
  req: AuthenticatedMedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) => {
  await ensureSellerCanAccessProduct(
    req.scope,
    req.seller_context!.seller_id,
    req.params.id
  )

  return next()
}

export const vendorProductsMiddlewares: MiddlewareRoute[] = [
  {
    method: ["GET"],
    matcher: "/vendor/products",
    middlewares: [
      validateAndTransformQuery(
        VendorGetProductsParams,
        vendorProductQueryConfig.list
      ),
      applySellerProductLinkFilter,
      applyMineProductsFilter,
      applyOfferedProductsFilter,
      applyPendingChangeFilter,
      applyDigitInsensitiveSearch,
    ],
  },
  {
    method: ["POST"],
    matcher: "/vendor/products",
    middlewares: [
      validateAndTransformBody(VendorCreateProduct),
      validateAndTransformQuery(
        VendorGetProductParams,
        vendorProductQueryConfig.retrieve
      ),
    ],
  },

  {
    method: ["GET"],
    matcher: "/vendor/products/:id",
    middlewares: [
      ensureSellerCanAccess,
      validateAndTransformQuery(
        VendorGetProductParams,
        vendorProductQueryConfig.retrieve
      ),
    ],
  },
  {
    method: ["POST"],
    matcher: "/vendor/products/:id",
    middlewares: [
      ensureSellerCanAccess,
      validateAndTransformBody(VendorUpdateProduct),
      validateAndTransformQuery(
        VendorGetProductParams,
        vendorProductQueryConfig.retrieve
      ),
    ],
  },
  {
    method: ["DELETE"],
    matcher: "/vendor/products/:id",
    middlewares: [ensureSellerCanAccess],
  },

  {
    method: ["POST"],
    matcher: "/vendor/products/:id/cancel",
    middlewares: [
      ensureSellerCanAccess,
      validateAndTransformBody(VendorCancelProductChange),
    ],
  },
  {
    method: ["POST"],
    matcher: "/vendor/products/:id/submit",
    middlewares: [
      ensureSellerCanAccess,
      validateAndTransformQuery(
        VendorGetProductParams,
        vendorProductQueryConfig.retrieve
      ),
    ],
  },

  {
    method: ["GET"],
    matcher: "/vendor/products/:id/variants",
    middlewares: [
      ensureSellerCanAccess,
      validateAndTransformQuery(
        VendorGetProductVariantsParams,
        vendorProductVariantQueryConfig.list
      ),
    ],
  },
  {
    method: ["POST"],
    matcher: "/vendor/products/:id/variants",
    middlewares: [
      ensureSellerCanAccess,
      validateAndTransformBody(VendorAddProductVariant),
      validateAndTransformQuery(
        VendorGetProductParams,
        vendorProductQueryConfig.retrieve
      ),
    ],
  },

  {
    method: ["GET"],
    matcher: "/vendor/products/:id/variants/:variant_id",
    middlewares: [
      ensureSellerCanAccess,
      validateAndTransformQuery(
        VendorGetProductVariantParams,
        vendorProductVariantQueryConfig.retrieve
      ),
    ],
  },
  {
    method: ["POST"],
    matcher: "/vendor/products/:id/variants/:variant_id",
    middlewares: [
      ensureSellerCanAccess,
      validateAndTransformBody(VendorUpdateProductVariant),
      validateAndTransformQuery(
        VendorGetProductParams,
        vendorProductQueryConfig.retrieve
      ),
    ],
  },
  {
    method: ["DELETE"],
    matcher: "/vendor/products/:id/variants/:variant_id",
    middlewares: [ensureSellerCanAccess],
  },

  {
    method: ["POST"],
    matcher: "/vendor/products/:id/attributes/batch",
    middlewares: [
      ensureSellerCanAccess,
      validateAndTransformBody(VendorBatchProductAttributes),
      validateAndTransformQuery(
        VendorGetProductParams,
        vendorProductQueryConfig.retrieve
      ),
    ],
  },
]
