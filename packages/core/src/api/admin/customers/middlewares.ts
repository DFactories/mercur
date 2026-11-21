import { MiddlewareRoute } from "@medusajs/framework/http"
import { validateAndTransformBody } from "@medusajs/framework"

import { AdminUpdateCustomerPhone } from "./validators"
import { applySpellingInsensitiveSearch } from "../../utils/digit-insensitive-search"

export const adminCustomersMiddlewares: MiddlewareRoute[] = [
  {
    // The list is Medusa's own route; this runs after its validator.
    method: ["GET"],
    matcher: "/admin/customers",
    middlewares: [applySpellingInsensitiveSearch("customer")],
  },
  {
    method: ["POST"],
    matcher: "/admin/customers/:id/phone",
    middlewares: [validateAndTransformBody(AdminUpdateCustomerPhone)],
  },
]
