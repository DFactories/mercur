import { MiddlewareRoute } from "@medusajs/framework/http"
import {
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework"

import { adminMemberListQueryConfig } from "./query-config"
import { AdminGetMembersParams, AdminUpdateMemberPhone } from "./validators"

export const adminMembersMiddlewares: MiddlewareRoute[] = [
  {
    method: ["GET"],
    matcher: "/admin/members",
    middlewares: [
      validateAndTransformQuery(
        AdminGetMembersParams,
        adminMemberListQueryConfig.list
      ),
    ],
  },
  {
    method: ["POST"],
    matcher: "/admin/members/:id/phone",
    middlewares: [validateAndTransformBody(AdminUpdateMemberPhone)],
  },
]
