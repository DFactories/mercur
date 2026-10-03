import {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaResponse,
  MiddlewareRoute,
} from "@medusajs/framework/http"
import { validateAndTransformQuery } from "@medusajs/framework"
import { ProductStatus } from "@mercurjs/types"

import {
  CREATOR_VISIBLE_STATUSES,
  getProductIdsRestrictedFromSeller,
  getSellerOwnedProductIds,
} from "../products/helpers"
import { vendorProductVariantsQueryConfig } from "./query-config"
import { VendorGetProductVariantsParams } from "./validators"

const applySellerProductVariantFilter = async (
  req: AuthenticatedMedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) => {
  const sellerId = req.seller_context!.seller_id

  const [ownProductIds, restrictedFromSellerIds] = await Promise.all([
    getSellerOwnedProductIds(req.scope, sellerId),
    getProductIdsRestrictedFromSeller(req.scope, sellerId),
  ])

  req.filterableFields ??= {}
  const existingAnd = (req.filterableFields.$and as object[] | undefined) ?? []
  req.filterableFields.$and = [
    ...existingAnd,
    {
      $or: [
        // Same rule as `/vendor/products`: attribution only covers
        // unpublished submissions (upstream #1552).
        {
          product_id: ownProductIds,
          product: { status: { $in: CREATOR_VISIBLE_STATUSES } },
        },
        {
          product: { status: ProductStatus.PUBLISHED },
          product_id: { $nin: restrictedFromSellerIds },
        },
      ],
    },
  ]

  return next()
}

export const vendorProductVariantsMiddlewares: MiddlewareRoute[] = [
  {
    method: ["GET"],
    matcher: "/vendor/product-variants",
    middlewares: [
      validateAndTransformQuery(
        VendorGetProductVariantsParams,
        vendorProductVariantsQueryConfig.list
      ),
      applySellerProductVariantFilter,
    ],
  },
]
