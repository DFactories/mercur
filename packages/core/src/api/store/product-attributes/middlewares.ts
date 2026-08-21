import {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
  MiddlewareRoute,
} from "@medusajs/framework/http"
import { validateAndTransformQuery } from "@medusajs/framework"

import { filterAttributesByCategoryLinkOrGlobal } from "../../utils"
import { storeProductAttributeQueryConfig } from "./query-config"
import {
  StoreGetProductAttributeParams,
  StoreGetProductAttributesParams,
} from "./validators"

const applyAttributeFilters = (req, _, next) => {
  req.filterableFields = req.filterableFields ?? {}
  req.filterableFields.is_active = true
  req.filterableFields.product_id = null
  next()
}

// The link pivot's FK column is `product_category_id` (derived from the
// productCategory linkable key), not `category_id`. Map the URL filter to the
// column the link service actually exposes. Mirrors the vendor route.
const renameCategoryIdFilter = (
  req: MedusaRequest,
  _: MedusaResponse,
  next: MedusaNextFunction
) => {
  const categoryId = req.filterableFields?.category_id
  if (categoryId !== undefined) {
    req.filterableFields.product_category_id = categoryId
    delete req.filterableFields.category_id
  }
  return next()
}

export const storeProductAttributesMiddlewares: MiddlewareRoute[] = [
  {
    method: ["GET"],
    matcher: "/store/product-attributes",
    middlewares: [
      validateAndTransformQuery(
        StoreGetProductAttributesParams,
        storeProductAttributeQueryConfig.list
      ),
      applyAttributeFilters,
      renameCategoryIdFilter,
      filterAttributesByCategoryLinkOrGlobal,
    ],
  },
  {
    method: ["GET"],
    matcher: "/store/product-attributes/:id",
    middlewares: [
      validateAndTransformQuery(
        StoreGetProductAttributeParams,
        storeProductAttributeQueryConfig.retrieve
      ),
      applyAttributeFilters,
    ],
  },
]
