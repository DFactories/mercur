import { MiddlewareRoute } from "@medusajs/framework/http"
import {
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework"

import {
  AdminCreateOfferDrafts,
  AdminGetOfferDraftsParams,
} from "./validators"

export const adminOfferDraftsMiddlewares: MiddlewareRoute[] = [
  {
    method: ["GET"],
    matcher: "/admin/offer-drafts",
    middlewares: [validateAndTransformQuery(AdminGetOfferDraftsParams, {})],
  },
  {
    method: ["POST"],
    matcher: "/admin/offer-drafts",
    middlewares: [validateAndTransformBody(AdminCreateOfferDrafts)],
  },
]
