import {
  validateAndTransformQuery,
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MiddlewareRoute } from "@medusajs/medusa"
import { sellerVisibilityFilters } from "../../utils/sellers"

import * as QueryConfig from "./query-config"
import { StoreGetSellersParams, StoreGetSellerParams } from "./validators"

function applySellerOpenFilters(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) {
  // One shared definition of "visible", so this route and the offer/product
  // routes can never answer the question differently — they used to hold two
  // copies of the predicate and both copies were wrong the same way.
  const { status, $or } = sellerVisibilityFilters()

  req.filterableFields.status ??= status

  req.filterableFields.$and ??= []
    ; (req.filterableFields.$and as any[]).push({ $or })

  next()
}

export const storeSellersMiddlewares: MiddlewareRoute[] = [
  {
    method: ["GET"],
    matcher: "/store/sellers",
    middlewares: [
      validateAndTransformQuery(
        StoreGetSellersParams,
        QueryConfig.listSellerQueryConfig
      ),
      applySellerOpenFilters,
    ],
  },
  {
    method: ["GET"],
    matcher: "/store/sellers/:id",
    middlewares: [
      validateAndTransformQuery(
        StoreGetSellerParams,
        QueryConfig.retrieveSellerQueryConfig
      ),
      applySellerOpenFilters,
    ],
  },
]
