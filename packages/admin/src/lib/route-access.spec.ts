import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

import { buildPermissionChecks } from "../providers/permissions-provider/checks"
import { firstReachablePath, routeAccess } from "./nav-permissions"

/**
 * A restricted operator never reaches a screen they may not open, and never
 * lands on one.
 *
 * The bug both halves close: the sidebar hid `/orders` from an onboarding
 * operator and sign-in redirected them straight to it anyway. The order list
 * asks for `order_group:read`, throws on the 403, and React Router renders
 * "An unexpected error occurred while rendering this page" — so a correctly
 * configured account looked broken on its very first screen.
 */
const checks = (permissions: string[], state?: Partial<{ isLoading: boolean; isError: boolean }>) =>
  buildPermissionChecks({
    permissions,
    isLoading: state?.isLoading ?? false,
    isError: state?.isError ?? false,
  })

const OPERATOR = ["seller:read", "seller:create", "store:read"]

describe("opening a route", () => {
  const access = (
    pathname: string,
    permissions: string[],
    state?: { isLoading?: boolean; isUnavailable?: boolean }
  ) =>
    routeAccess({
      pathname,
      hasPermission: checks(permissions, {
        isLoading: state?.isLoading,
        isError: state?.isUnavailable,
      }).hasPermission,
      isLoading: state?.isLoading ?? false,
      isUnavailable: state?.isUnavailable ?? false,
    })

  it("refuses the screen the operator was being redirected onto", () => {
    expect(access("/orders", OPERATOR)).toBe("deny")
  })

  it("allows the screens the operator's role is for", () => {
    expect(access("/stores", OPERATOR)).toBe("allow")
    expect(access("/stores/sel_01ABC", OPERATOR)).toBe("allow")
  })

  it("never refuses a path with no mapped permission", () => {
    // `/settings/profile` is deliberately unmapped: refusing somebody their own
    // account page is a lockout dressed as tidiness.
    expect(access("/settings/profile", [])).toBe("allow")
    expect(access("/", [])).toBe("allow")
    expect(access("/some-screen-nobody-mapped", [])).toBe("allow")
  })

  it("waits rather than guessing while the permission list loads", () => {
    // The sidebar shows everything in this state; a route must not, or the
    // page mounts, fires its query and throws on the 403 before the answer
    // arrives.
    expect(access("/orders", [], { isLoading: true })).toBe("pending")
  })

  it("allows when the permission list could not be fetched", () => {
    // Same fail-open as the sidebar. The server refuses either way; blanking
    // the panel over an unreachable courtesy endpoint would not.
    expect(access("/orders", [], { isUnavailable: true })).toBe("allow")
  })

  it("admits a super admin everywhere", () => {
    const everything = ["order:read", "seller:read", "user:read"]
    expect(access("/orders", everything)).toBe("allow")
    expect(access("/settings/users", everything)).toBe("allow")
  })
})

describe("where an operator lands", () => {
  /** The core sidebar, in its rendered order. */
  const SIDEBAR = [
    { to: "/orders" },
    { to: "/products", items: [{ to: "/offers" }, { to: "/collections" }] },
    { to: "/stores", items: [{ to: "/reviews" }] },
    { to: "/payouts" },
  ]

  it("sends the onboarding operator to Stores, not to Orders", () => {
    expect(firstReachablePath(SIDEBAR, checks(OPERATOR).hasPermission)).toBe(
      "/stores"
    )
  })

  it("sends a super admin to the first entry, as before", () => {
    expect(
      firstReachablePath(
        SIDEBAR,
        checks(["order:read", "product:read", "seller:read", "payout:read"])
          .hasPermission
      ).valueOf()
    ).toBe("/orders")
  })

  it("falls through to a permitted CHILD when the parent is refused", () => {
    // Granting `offer:read` alone should land somebody on Offers rather than
    // nowhere — the same rule the sidebar uses to keep the parent visible.
    expect(
      firstReachablePath(SIDEBAR, checks(["offer:read"]).hasPermission)
    ).toBe("/offers")
  })

  it("answers null when nothing in the sidebar is reachable", () => {
    expect(firstReachablePath(SIDEBAR, checks([]).hasPermission)).toBeNull()
  })
})

describe("the redirects that used to point at /orders", () => {
  const read = (path: string) => readFileSync(join(__dirname, "..", path), "utf8")

  it("login sends an unauthenticated visitor to the home router", () => {
    // The login page cannot choose: the permissions request is authenticated,
    // so there is nothing to choose FROM until after sign-in.
    const source = read("pages/login/login.tsx")
    expect(source).toContain('location.state?.from?.pathname || "/"')
    expect(source).not.toContain('|| "/orders"')
  })

  it("leaving settings goes to the home router too", () => {
    const source = read("components/layout/settings-layout/settings-layout.tsx")
    expect(source).not.toContain('"/orders"')
  })

  it("home no longer hard-codes a destination", () => {
    const source = read("pages/home/home.tsx")
    expect(source).toContain("firstReachablePath")
    expect(source).not.toContain('navigate("/orders"')
  })

  it("both layouts wrap their children in the guard", () => {
    // Without the mount, every assertion above is about a function nobody
    // calls.
    const source = readFileSync(join(__dirname, "../get-route-map.tsx"), "utf8")
    expect(source).toContain("RoutePermissionGuard")
    expect(source.match(/children: guarded\(mergeRoutes\(/g)).toHaveLength(2)
  })
})
