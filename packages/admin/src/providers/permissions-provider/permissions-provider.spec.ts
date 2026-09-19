import { describe, expect, it } from "vitest"

import { isNavItemVisible, registerNavPermissions } from "../../lib/nav-permissions"
import { buildPermissionChecks } from "./checks"

/**
 * The sidebar filter, end to end, minus React.
 *
 * Every other test in this change checks one half: `nav-permissions.spec.ts`
 * proves a path maps to a permission, and the server specs prove the route
 * refuses. Neither shows the two composed — that a given operator, holding a
 * given grant list, is shown a specific sidebar.
 *
 * This does, against the real provider logic and the real visibility rule. It
 * is the closest thing to watching the panel filter that does not require a DOM
 * and a logged-in session.
 */

/** A realistic slice of the sidebar: parents, children, and a settings page. */
const SIDEBAR = [
  { to: "/orders" },
  { to: "/products", items: [{ to: "/offers" }, { to: "/collections" }] },
  { to: "/customers", items: [{ to: "/customer-groups" }] },
  { to: "/payouts" },
  { to: "/settings/users" },
  { to: "/settings/profile" },
]

const render = (state: {
  permissions: string[]
  isLoading?: boolean
  isError?: boolean
}) => {
  const { hasPermission } = buildPermissionChecks({
    permissions: state.permissions,
    isLoading: state.isLoading ?? false,
    isError: state.isError ?? false,
  })

  return SIDEBAR.filter((item) => isNavItemVisible(item, hasPermission)).map(
    (item) => item.to
  )
}

describe("what the sidebar actually shows", () => {
  it("shows a super admin everything", () => {
    // `/admin/rbac/me/permissions` expands `*:*` server-side, so a super admin
    // arrives here as a literal list, not a wildcard the panel has to interpret.
    const everything = [
      "order:read",
      "product:read",
      "offer:read",
      "product_collection:read",
      "customer:read",
      "customer_group:read",
      "payout:read",
      "user:read",
    ]

    expect(render({ permissions: everything })).toEqual(SIDEBAR.map((i) => i.to))
  })

  it("shows an onboarding operator almost nothing", () => {
    // The role release 1 defined: find or create a store, take a seat on it.
    // None of the sidebar above is its work — and its own account page is.
    expect(
      render({ permissions: ["store:read", "notification:read", "seller:read"] })
    ).toEqual(["/settings/profile"])
  })

  it("keeps a parent alive for the sake of one child", () => {
    // Granting `offer:read` alone must not hide Products and take Offers with it.
    expect(render({ permissions: ["offer:read"] })).toEqual([
      "/products",
      "/settings/profile",
    ])
  })

  it("does not let /customers leak /customer-groups", () => {
    // Longest-match: these are neighbouring prefixes, and `customer:read` must
    // not imply the group list.
    expect(render({ permissions: ["customer:read"] })).toEqual([
      "/customers",
      "/settings/profile",
    ])
  })

  it("never hides the operator's own account, even with no permissions at all", () => {
    expect(render({ permissions: [] })).toEqual(["/settings/profile"])
  })

  it("shows everything while the permission list is still loading", () => {
    // No flash of an empty panel on every page load.
    expect(render({ permissions: [], isLoading: true })).toEqual(
      SIDEBAR.map((i) => i.to)
    )
  })

  it("shows everything when the permission request failed", () => {
    // A failed request must cost a readable 403, not a panel that looks like
    // the operator was demoted. The routes still refuse them.
    expect(render({ permissions: [], isError: true })).toEqual(
      SIDEBAR.map((i) => i.to)
    )
  })

  it("filters a marketplace's own screens once they are registered", () => {
    registerNavPermissions({ "/payout-requests": "payout_request:read" })
    const nav = [{ to: "/payout-requests" }]

    const denied = buildPermissionChecks({
      permissions: ["order:read"],
      isLoading: false,
      isError: false,
    })
    const allowed = buildPermissionChecks({
      permissions: ["payout_request:read"],
      isLoading: false,
      isError: false,
    })

    expect(nav.filter((i) => isNavItemVisible(i, denied.hasPermission))).toEqual([])
    expect(nav.filter((i) => isNavItemVisible(i, allowed.hasPermission))).toEqual(nav)
  })
})
