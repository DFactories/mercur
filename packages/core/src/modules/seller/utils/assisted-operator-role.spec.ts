import { describe, expect, it } from "vitest"

import { SellerRole } from "@mercurjs/types"
import { SELLER_ROLES } from "./ensure-seller-default-roles"

/**
 * The assisted-onboarding operator role, and the two things it must not have.
 *
 * Assisted onboarding puts an internal operator on a producer's real store to
 * fill it in for them. Until this role existed the operator was given Seller
 * Administration — because filling in the store profile requires it — and that
 * role can also change the IBAN, change who else has access, and publish the
 * store. All three were "procedural": nothing in the server stopped them.
 *
 * Publishing is the one that matters most. The entire promise of the programme
 * is that the producer sees the store before it goes live, and the only thing
 * enforcing that promise was an operator remembering not to press a button.
 *
 * This spec pins the permission SHAPE. The publication half is enforced in the
 * consumer repo (`vendor-readiness/definitions.ts` leaves this role out of the
 * publication step's `required_roles`) and pinned by its own spec there — the
 * two must be read together.
 */

const byId = (id: SellerRole) => {
  const role = SELLER_ROLES.find((r) => r.id === id)
  expect(role, `no role definition for ${id}`).toBeDefined()
  return role!
}

describe("assisted onboarding operator role", () => {
  it("is defined, and not as a wildcard", () => {
    const role = byId(SellerRole.ASSISTED_OPERATOR)

    // `"*"` is how Seller Administration is bound. Using it here would hand
    // back every policy that exists — including the two below — and the role
    // would be Administration with a different name.
    expect(role.policyKeys).not.toBe("*")
    expect(Array.isArray(role.policyKeys)).toBe(true)
  })

  it("can read and update the store, because filling it in is the job", () => {
    const keys = byId(SellerRole.ASSISTED_OPERATOR).policyKeys as string[]

    expect(keys).toContain("seller:read")
    expect(keys).toContain("seller:update")
  })

  it("cannot touch the bank details", () => {
    const keys = byId(SellerRole.ASSISTED_OPERATOR).policyKeys as string[]

    // Only meaningful because payout details are their own resource. While
    // `POST /vendor/sellers/:id/payment-details` declared `seller:update`,
    // "can type a postal code" and "can change where the money goes" were the
    // same permission and this assertion could not have been written.
    expect(keys).not.toContain("seller_payment_details:update")
  })

  it("can see the team but cannot change it", () => {
    const keys = byId(SellerRole.ASSISTED_OPERATOR).policyKeys as string[]

    expect(keys).toContain("seller_member:read")
    expect(keys).not.toContain("seller_member:create")
    expect(keys).not.toContain("seller_member:update")
    expect(keys).not.toContain("seller_member:delete")
  })

  it("leaves Seller Administration a wildcard", () => {
    // The split of payout details into their own resource must not have
    // quietly taken it away from the owner's role: `ensureSellerMiddleware`
    // maps an owner onto Seller Administration, so a regression here locks a
    // producer out of their own bank details.
    expect(byId(SellerRole.SELLER_ADMINISTRATION).policyKeys).toBe("*")
  })
})
