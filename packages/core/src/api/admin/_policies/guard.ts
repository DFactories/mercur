import { MiddlewareRoute } from "@medusajs/framework/http"
import { PolicyOperation } from "@medusajs/framework/utils"

/**
 * Declare RBAC policies for a whole admin resource in one line.
 *
 * NOTE: `dfactories-mp` carries a copy of this helper for its own admin
 * surfaces. The two are deliberately independent — this is a pure function over
 * strings, and coupling them would mean a version bump of this package for
 * every tweak to a consumer's declarations. If they ever need to diverge in
 * BEHAVIOUR rather than in content, export this one and delete the copy.
 *
 * ## Why a helper and not 86 hand-written entries
 *
 * `packages/api/src/api/middlewares.ts` composes every group into one array, so
 * a helper applied at that seam turns the whole surface into ~20 reviewable
 * lines. A list of individual entries goes stale the first time somebody adds a
 * route, and `__tests__/enforcement-sweep.unit.spec.ts` would then fail for a
 * reason nobody wrote down.
 *
 * ## The shape is Medusa core's, deliberately
 *
 * Core does not guard detail routes one at a time. `GET /admin/orders/:id`
 * declares nothing; `/admin/orders/*` with **no `method`** and `order:read`
 * covers it, and 52 of core's admin entries are exactly that. Writes then add a
 * second, narrower entry on top, so a POST to a subpath needs both `read` (to
 * be in the area at all) and `update`.
 *
 * Copying that shape means one mental model across core, the fork and here —
 * and it means a new sub-route is covered the moment it exists, rather than
 * when someone remembers to list it.
 *
 * ## `create` vs `update`
 *
 * POST on the collection root is `create`; POST on anything below it is
 * `update`. That is a rule about URL shape, not a guess about intent, and it
 * matches how every resource here is actually laid out
 * (`POST /admin/kyc-reasons` creates, `POST /admin/kyc-reasons/:id` edits).
 *
 * ## What it deliberately does NOT do
 *
 * It never emits an empty `policies` array. `route.policies` is truthy when it
 * is `[]`, so the router wraps the route and `checkPermissions` then returns
 * early before the role check — a route that looks guarded and is not. Every
 * entry below carries exactly one policy.
 */
export function guardResource(
  resource: string,
  prefix: string
): MiddlewareRoute[] {
  const at = (operation: string) => [{ resource, operation }]

  return [
    // Everything below the prefix needs `read`, whatever the verb. This is the
    // methodless entry that covers detail routes without naming them.
    {
      matcher: `${prefix}/*`,
      middlewares: [],
      policies: at(PolicyOperation.read),
    },
    // The collection root itself — `${prefix}/*` does not match `${prefix}`.
    {
      method: ['GET'],
      matcher: prefix,
      middlewares: [],
      policies: at(PolicyOperation.read),
    },
    {
      method: ['POST'],
      matcher: prefix,
      middlewares: [],
      policies: at(PolicyOperation.create),
    },
    {
      method: ['POST', 'PUT', 'PATCH'],
      matcher: `${prefix}/*`,
      middlewares: [],
      policies: at(PolicyOperation.update),
    },
    {
      method: ['DELETE'],
      matcher: prefix,
      middlewares: [],
      policies: at(PolicyOperation.delete),
    },
    {
      method: ['DELETE'],
      matcher: `${prefix}/*`,
      middlewares: [],
      policies: at(PolicyOperation.delete),
    },
  ]
}

/** Apply {@link guardResource} to a whole map of resource → URL prefix. */
export function guardResources(
  map: Record<string, string | string[]>
): MiddlewareRoute[] {
  return Object.entries(map).flatMap(([resource, prefix]) =>
    (Array.isArray(prefix) ? prefix : [prefix]).flatMap((p) =>
      guardResource(resource, p)
    )
  )
}
