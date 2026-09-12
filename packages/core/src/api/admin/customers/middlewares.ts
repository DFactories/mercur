import { MiddlewareRoute } from "@medusajs/framework/http"
import { validateAndTransformBody } from "@medusajs/framework"

import { AdminUpdateCustomerPhone } from "./validators"

export const adminCustomersMiddlewares: MiddlewareRoute[] = [
  {
    method: ["POST"],
    matcher: "/admin/customers/:id/phone",
    middlewares: [validateAndTransformBody(AdminUpdateCustomerPhone)],
  },
]
