import {
  MiddlewareRoute,
} from "@medusajs/framework/http"
import {
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework"

import { vendorShippingProfileQueryConfig } from "./query-config"
import {
  VendorCreateShippingProfile,
  VendorGetShippingProfileParams,
  VendorGetShippingProfilesParams,
  VendorUpdateShippingProfile,
} from "./validators"

export const vendorShippingProfilesMiddlewares: MiddlewareRoute[] = [
  {
    method: ["GET"],
    matcher: "/vendor/shipping-profiles",
    middlewares: [
      validateAndTransformQuery(
        VendorGetShippingProfilesParams,
        vendorShippingProfileQueryConfig.list
      ),
      // NOTE: no seller link-filter here. The GET handler returns the seller's
      // own profiles UNION the global (admin-curated) profiles — see route.ts.
    ],
  },
  {
    method: ["POST"],
    matcher: "/vendor/shipping-profiles",
    middlewares: [
      validateAndTransformBody(VendorCreateShippingProfile),
      validateAndTransformQuery(
        VendorGetShippingProfileParams,
        vendorShippingProfileQueryConfig.retrieve
      ),
    ],
  },
  {
    method: ["GET"],
    matcher: "/vendor/shipping-profiles/:id",
    middlewares: [
      validateAndTransformQuery(
        VendorGetShippingProfileParams,
        vendorShippingProfileQueryConfig.retrieve
      ),
    ],
  },
  {
    method: ["POST"],
    matcher: "/vendor/shipping-profiles/:id",
    middlewares: [
      validateAndTransformBody(VendorUpdateShippingProfile),
      validateAndTransformQuery(
        VendorGetShippingProfileParams,
        vendorShippingProfileQueryConfig.retrieve
      ),
    ],
  },
  {
    method: ["DELETE"],
    matcher: "/vendor/shipping-profiles/:id",
    middlewares: [],
  },
]
