import { Policy } from "@medusajs/framework/utils"
import { describe, expect, it } from "vitest"

import { MARKETPLACE_POLICY_RESOURCES, marketplacePolicies } from "./marketplace"
import { sellerPolicies } from "./seller"

/**
 * These resources exist so release 2 has something real to declare against.
 *
 * A `policies` declaration naming a resource nobody defined does not fail loudly
 * — it resolves to no row, so the role is DENIED that route while the panel
 * shows it as configured. Asserting the registration here is what makes the
 * declaration in `api/admin/**\/middlewares.ts` safe to write.
 *
 * Importing the modules is what registers them: discovery is by file system at
 * boot, so nothing else in `src` imports these files and that is expected, not
 * dead code.
 */
describe("marketplace policies", () => {
  const registered = new Set(
    Object.values(Policy).map((p) => `${p.resource}:${p.operation}`)
  )

  it("registers every marketplace resource with all four operations", () => {
    void marketplacePolicies
    void sellerPolicies

    const missing: string[] = []
    for (const resource of MARKETPLACE_POLICY_RESOURCES) {
      for (const operation of ["read", "create", "update", "delete"]) {
        const key = `${resource}:${operation}`
        if (!registered.has(key)) {
          missing.push(key)
        }
      }
    }

    expect(missing).toEqual([])
  })

  it("does not invent a `member` resource for /admin/members", () => {
    // /admin/members queries `entity: "member"`, the seller-member model, so it
    // belongs to `seller_member`. A `member` resource would be a key that binds
    // to nothing — the failure this whole file exists to prevent.
    expect(registered.has("member:read")).toBe(false)
    expect(registered.has("seller_member:read")).toBe(true)
  })

  it("does not redefine a resource Medusa core already owns", () => {
    // `orders`, `products`, `collections` and friends map onto core resources.
    // Defining them again here would be harmless but misleading about ownership.
    const coreOwned = ["order", "product", "product_collection", "customer"]
    for (const resource of coreOwned) {
      expect(MARKETPLACE_POLICY_RESOURCES).not.toContain(resource)
    }
  })
})
