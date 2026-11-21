import { MiddlewareRoute } from "@medusajs/framework/http"
import {
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework"

import {
  applyGroupedOfferProductFilter,
  applyOfferDraftVisibility,
} from "../../utils"
import { adminOfferQueryConfig } from "./query-config"
import {
  AdminCreateOffersBatch,
  AdminGetOfferParams,
  AdminGetOffersParams,
} from "./validators"
import { applySpellingInsensitiveSearch } from "../../utils/digit-insensitive-search"

export const adminOffersMiddlewares: MiddlewareRoute[] = [
  {
    method: ["GET"],
    matcher: "/admin/offers",
    middlewares: [
      validateAndTransformQuery(
        AdminGetOffersParams,
        adminOfferQueryConfig.list
      ),
      applyGroupedOfferProductFilter,
      applySpellingInsensitiveSearch("offer"),
      applyOfferDraftVisibility,
    ],
  },
  {
    method: ["POST"],
    matcher: "/admin/offers/batch",
    middlewares: [
      validateAndTransformBody(AdminCreateOffersBatch),
      validateAndTransformQuery(
        AdminGetOffersParams,
        adminOfferQueryConfig.list
      ),
    ],
  },
  {
    method: ["GET"],
    matcher: "/admin/offers/:id",
    middlewares: [
      validateAndTransformQuery(
        AdminGetOfferParams,
        adminOfferQueryConfig.retrieve
      ),
    ],
  },
]
