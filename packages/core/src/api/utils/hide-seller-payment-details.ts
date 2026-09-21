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
 * grants — but only on the WRITE side. Reading stayed inside `seller:read`,
 * and `adminSellerFields` selects `*payment_details`, so every admin role that
 * can open the store list was handed every producer's IBAN with it.
 *
 * This drops the field from `req.queryConfig.fields` rather than scrubbing the
 * response, so the value is never read out of the database at all.
 *
 * Not done with the platform's own `RBACFieldFilter`: that is gated behind the
 * `rbac_filter_fields` feature flag, which a consumer sets globally, and it
 * would then start filtering relations on every route with an `entity` in its
 * query config. A change that wide is a deployment's decision, not this
 * package's.
 */
const FIELD = "payment_details"

/** `payment_details`, `payment_details.*`, `payment_details.iban`, `*payment_details`. */
const isPaymentDetailField = (field: string): boolean => {
  const name = field.replace(/^[+*]/, "")
  return name === FIELD || name.startsWith(`${FIELD}.`)
}

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
