import { MiddlewareRoute } from "@medusajs/framework/http"
import { validateAndTransformBody } from "@medusajs/framework"

import { AdminUpdateNotificationSettings } from "./validators"

export const adminNotificationSettingsMiddlewares: MiddlewareRoute[] = [
  {
    method: ["POST"],
    matcher: "/admin/notification-settings",
    middlewares: [validateAndTransformBody(AdminUpdateNotificationSettings)],
  },
]
