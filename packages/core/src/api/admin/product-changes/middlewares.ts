import { MiddlewareRoute } from "@medusajs/framework/http"
import { validateAndTransformBody } from "@medusajs/framework"

import {
  AdminCancelProductChange,
  AdminConfirmProductChange,
  AdminRejectProductChange,
} from "./validators"

export const adminProductChangesMiddlewares: MiddlewareRoute[] = [
  {
    method: ["POST"],
    matcher: "/admin/product-changes/:id/confirm",
    middlewares: [validateAndTransformBody(AdminConfirmProductChange)],
  },
  {
    method: ["POST"],
    matcher: "/admin/product-changes/:id/cancel",
    middlewares: [validateAndTransformBody(AdminCancelProductChange)],
  },
  {
    method: ["POST"],
    matcher: "/admin/product-changes/:id/reject",
    middlewares: [validateAndTransformBody(AdminRejectProductChange)],
  },
]
