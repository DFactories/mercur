import { describe, expect, it } from "vitest"

import { vendorSellersMiddlewares } from "./middlewares"

/**
 * Every write to a seller account must declare an RBAC policy.
 *
 * Role enforcement on vendor routes is not done by a guard in the handler — it
 * is declared as `policies` on the middleware entry, and Medusa's router wraps
 * the route with a permission check when the `rbac` feature flag is on (it is:
 * `with-mercur.ts` sets `rbac: true`, as does mp's `medusa-config.ts`). The
 * policies themselves are registered by file-system discovery of
 * `src/policies/`, not by an import, so `sellerPolicies` being referenced
 * nowhere is expected and not a sign that it is dead.
 *
 * The weakness of a declarative guard is that omitting it fails OPEN and looks
 * like nothing. That is exactly what happened: `POST /vendor/sellers/:id`
 * declared `update seller` and `POST /vendor/sellers/me` declared nothing,
 * while both take `VendorUpdateSeller` and both run `updateSellersWorkflow`
 * against the caller's own store. Any member of any role could make the
 * identical change by choosing the other URL — including editing
 * `closed_from` / `closed_to`, which hides the whole catalogue from the
 * storefront.
 *
 * So this asserts the class, not the instance: a new write route under
 * `/vendor/sellers` that forgets its policy fails here rather than in
 * production.
 */

/**
 * Routes that create the seller context rather than act inside one.
 *
 * `POST /vendor/sellers` is registration — there is no seller to hold a role
 * in yet — and `/vendor/sellers/select` only chooses which existing membership
 * the session points at, which `ensureSellerMiddleware` already verifies.
 * Both sit above the `/vendor/*` chain in `api/vendor/middlewares.ts` for the
 * same reason.
 */
const BOOTSTRAP_MATCHERS = ["/vendor/sellers", "/vendor/sellers/select"]

const writeRoutes = vendorSellersMiddlewares.filter((route) => {
  const methods = (route.method ?? []) as string[]
  const mutates = methods.some((m) => m !== "GET")
  return mutates && !BOOTSTRAP_MATCHERS.includes(route.matcher as string)
})

describe("vendor seller write routes", () => {
  it("has write routes to check", () => {
    // An empty filter would make every assertion below vacuous — the failure
    // mode where a suite stays green while covering nothing.
    expect(writeRoutes.length).toBeGreaterThan(5)
  })

  it.each(
    writeRoutes.map((route) => ({
      name: `${(route.method as string[]).join("/")} ${route.matcher}`,
      route,
    }))
  )("$name declares a policy", ({ route }) => {
    expect(route.policies ?? []).not.toHaveLength(0)
  })

  it("guards /vendor/sellers/me exactly like its /vendor/sellers/:id twin", () => {
    // The regression itself: same body, same workflow, same seller — so the
    // same policy, or the guarded one is merely the route nobody calls.
    const policiesFor = (matcher: string) =>
      writeRoutes
        .filter(
          (r) =>
            r.matcher === matcher &&
            ((r.method ?? []) as string[]).includes("POST")
        )
        .flatMap((r) => (r.policies ?? []) as { resource: string; operation: string }[])
        .map((p) => `${p.resource}:${p.operation}`)
        .sort()

    const me = policiesFor("/vendor/sellers/me")
    const byId = policiesFor("/vendor/sellers/:id")

    expect(byId).not.toHaveLength(0)
    expect(me).toEqual(byId)
  })
})
