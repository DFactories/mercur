import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Bank details must not share a policy with the store profile.
 *
 * `POST /vendor/sellers/:id/payment-details` declared `seller:update` — the
 * same policy as the store's name, handle, description and postal code. Any
 * role allowed to fill in a profile was therefore also allowed to change where
 * the money goes, and no role could ever be granted one without the other.
 *
 * That is why the assisted-onboarding operator could not exist before: the
 * job is "fill in the profile", and the permission for it came with the IBAN
 * attached.
 *
 * Asserted against the middleware source rather than by importing it, the way
 * `policies.spec.ts` next door does: importing pulls in the framework's route
 * loader and the validators, which is a running backend's worth of graph for
 * a question about one declaration.
 */
const source = readFileSync(join(__dirname, "middlewares.ts"), "utf8")

/** The middleware entry for one matcher + method, up to its closing brace. */
const entryFor = (method: string, matcher: string): string => {
  const re = new RegExp(
    `\\{\\s*method: \\["${method}"\\],\\s*matcher: "${matcher.replace(
      /[/:]/g,
      (c) => "\\" + c
    )}",[\\s\\S]*?\\n  \\},`
  )
  const m = source.match(re)
  expect(m, `no ${method} ${matcher} entry found`).not.toBeNull()
  return m![0]
}

describe("vendor seller payout routes", () => {
  it("guards payment-details with its own resource", () => {
    const entry = entryFor("POST", "/vendor/sellers/:id/payment-details")

    expect(entry).toContain("Entities.seller_payment_details")
    // The regression: falling back to the profile's policy.
    expect(entry).not.toMatch(/resource: Entities\.seller,/)
  })

  it("still guards the profile itself with seller:update", () => {
    // The split must not have moved the profile onto the payout resource,
    // which would invert the bug rather than fix it.
    const entry = entryFor("POST", "/vendor/sellers/:id")

    expect(entry).toMatch(/resource: Entities\.seller,/)
    expect(entry).toContain("PolicyOperation.update")
  })

  it("declares the resource so the policy actually exists", () => {
    // A policy key that no `definePolicies` call ever registered binds to
    // nothing: `ensureSellerDefaultRoles` looks policies up by key and simply
    // skips the ones it cannot find, so the route would fail OPEN for every
    // role rather than closed. This is the same silent-drop shape that has
    // bitten this codebase through `query.graph` field lists.
    const policies = readFileSync(
      join(__dirname, "..", "..", "..", "policies", "seller.ts"),
      "utf8"
    )

    expect(policies).toContain('"seller_payment_details"')
    expect(policies).toMatch(/\["seller_payment_details", \[[^\]]*"update"/)
  })
})
