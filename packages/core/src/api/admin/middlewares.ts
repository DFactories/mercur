import {
  AuthenticatedMedusaRequest,
  maybeApplyLinkFilter,
  MedusaNextFunction,
  MedusaResponse,
  MiddlewareRoute,
} from "@medusajs/framework/http"
import { validateAndTransformQuery } from "@medusajs/framework"

import { adminOrderGroupsMiddlewares } from "./order-groups/middlewares"
import { adminOrderGroupQueryConfig } from "./order-groups/query-config"
import { AdminGetOrderGroupParams } from "./order-groups/validators"
import { adminOrdersMiddlewares } from "./orders/middlewares"
import { adminCustomerGroupsMiddlewares } from "./customer-groups/middlewares"
import { adminOffersMiddlewares } from "./offers/middlewares"
import { adminPayoutsMiddlewares } from "./payouts/middlewares"
import { adminSellersMiddlewares } from "./sellers/middlewares"
import { adminMembersMiddlewares } from "./members/middlewares"
import { adminCommissionRatesMiddlewares } from "./commission-rates/middlewares"
import { adminNotificationSettingsMiddlewares } from "./notification-settings/middlewares"

import { adminProductsMiddlewares } from "./products/middlewares"
import { adminCollectionsMiddlewares } from "./collections/middlewares"
import { adminProductCategoriesMiddlewares } from "./product-categories/middlewares"
import { adminProductAttributesMiddlewares } from "./product-attributes/middlewares"
import { adminProductChangesMiddlewares } from "./product-changes/middlewares"
import { adminStockLocationsMiddlewares } from "./stock-locations/middlewares"
import { adminShippingOptionsMiddlewares } from "./shipping-options/middlewares"
import { adminShippingProfilesMiddlewares } from "./shipping-profiles/middlewares"

// Admins can scope the platform-wide products/orders lists to one seller via
// ?seller_id=... (used by the operator panel's per-store drill-down).
const maybeApplySellerProductFilter = (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) => {
  if (!req.query.seller_id) {
    return next()
  }

  req.filterableFields.seller_id = req.query.seller_id

  return maybeApplyLinkFilter({
    entryPoint: "product_seller",
    resourceId: "product_id",
    filterableField: "seller_id",
  })(req, res, next)
}

const maybeApplySellerOrderFilter = (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) => {
  if (!req.query.seller_id) {
    return next()
  }

  req.filterableFields.seller_id = req.query.seller_id

  return maybeApplyLinkFilter({
    entryPoint: "order_seller",
    resourceId: "order_id",
    filterableField: "seller_id",
  })(req, res, next)
}

export const adminMiddlewares: MiddlewareRoute[] = [
  ...adminOrderGroupsMiddlewares,
  {
    method: ["GET"],
    matcher: "/admin/orders/:id/order-group",
    middlewares: [
      validateAndTransformQuery(
        AdminGetOrderGroupParams,
        adminOrderGroupQueryConfig.retrieve
      ),
    ],
  },
  ...adminOrdersMiddlewares,
  ...adminCustomerGroupsMiddlewares,
  ...adminOffersMiddlewares,
  ...adminPayoutsMiddlewares,
  ...adminSellersMiddlewares,
  ...adminMembersMiddlewares,
  ...adminCommissionRatesMiddlewares,
  ...adminNotificationSettingsMiddlewares,
  {
    method: ["GET"],
    matcher: "/admin/products",
    middlewares: [
      maybeApplySellerProductFilter,
    ],
  },
  {
    method: ["GET"],
    matcher: "/admin/orders",
    middlewares: [
      maybeApplySellerOrderFilter,
    ],
  },
  ...adminProductsMiddlewares,
  ...adminCollectionsMiddlewares,
  ...adminProductCategoriesMiddlewares,
  ...adminProductAttributesMiddlewares,
  ...adminProductChangesMiddlewares,
  ...adminStockLocationsMiddlewares,
  ...adminShippingOptionsMiddlewares,
  ...adminShippingProfilesMiddlewares,
]
