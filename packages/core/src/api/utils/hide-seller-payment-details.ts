import { hasPermission } from "@medusajs/framework"
import {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaResponse,
  MiddlewareRoute,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * Keep a producer's bank details out of a response the caller may not read.
 *
 * `seller_payment_details` was split out of `seller` so that filling in a
 * store's profile and changing where its money goes could be different
 * grants — but only on the WRITE side. Reading stayed inside `seller:read`
 * and inside being a member at all, while three query configs select the
 * relation by default:
 *
 *   admin  `adminSellerFields`                  `*payment_details`
 *   vendor `retrieveVendorSellerQueryConfig`    `*payment_details`
 *   vendor `retrieveVendorMemberMeQueryConfig`  `seller.payment_details.*`
 *
 * So every admin role that could open the store list read every producer's
 * IBAN, and every member of a store read that store's — a Support or
 * Inventory seat included, and the assisted-onboarding operator whose entire
 * definition is that money is not their business.
 *
 * This drops the field from `req.queryConfig.fields` rather than scrubbing the
 * response, so the value is never read out of the database at all.
 *
 * On the vendor side the roles it asks about are the SELLER roles:
 * `ensureSellerMiddleware` puts the member's effective role in
 * `app_metadata.roles`, mapping an owner to Seller Administration, so an owner
 * is never filtered out of their own bank details.
 *
 * Not done with the platform's own `RBACFieldFilter`: that is gated behind the
 * `rbac_filter_fields` feature flag, which a consumer sets globally, and it
 * would then start filtering relations on every route with an `entity` in its
 * query config. A change that wide is a deployment's decision, not this
 * package's.
 */
const FIELD = "payment_details"

/**
 * Any dotted path with a `payment_details` SEGMENT — `payment_details`,
 * `payment_details.iban`, `*payment_details`, `seller.payment_details.*`.
 *
 * Matched by segment rather than by prefix so a future `payment_details_note`
 * is not swept up, and so the nested vendor shape is not missed.
 */
const isPaymentDetailField = (field: string): boolean =>
  field
    .replace(/^[+]/, "")
    .split(".")
    .some((segment) => segment.replace(/^\*/, "") === FIELD)

const rbacEnabled = (req: AuthenticatedMedusaRequest): boolean => {
  try {
    const router = req.scope.resolve<{
      isFeatureEnabled: (key: string) => boolean
    }>(ContainerRegistrationKeys.FEATURE_FLAG_ROUTER)
    return router.isFeatureEnabled("rbac")
  } catch {
    return false
  }
}

export const hideSellerPaymentDetails = async (
  req: AuthenticatedMedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) => {
  const fields = req.queryConfig?.fields
  if (!fields?.length || !rbacEnabled(req)) {
    return next()
  }

  const roles = (req.auth_context?.app_metadata?.roles ?? []) as string[]

  // `hasPermission` answers true for an empty role list — it reads that as
  // "rbac is not in play". Here it would mean the opposite, so ask only when
  // there is something to ask about.
  if (roles.length) {
    try {
      const allowed = await hasPermission({
        roles,
        actions: [{ resource: "seller_payment_details", operation: "read" }],
        container: req.scope,
      })

      if (allowed) {
        return next()
      }
    } catch (error) {
      return next(error as Error)
    }
  }

  req.queryConfig.fields = fields.filter((field) => !isPaymentDetailField(field))

  return next()
}

/** Append the guard to every entry, so a route added later is covered too. */
export const withHiddenPaymentDetails = (
  routes: MiddlewareRoute[]
): MiddlewareRoute[] =>
  routes.map((route) => ({
    ...route,
    middlewares: [...(route.middlewares ?? []), hideSellerPaymentDetails],
  }))
