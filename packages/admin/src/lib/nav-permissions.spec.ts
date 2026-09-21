import { readFileSync } from "fs"
import { join } from "path"
import { beforeEach, describe, expect, it } from "vitest"

import {
  getNavPermissions,
  isNavItemVisible,
  permissionForPath,
  registerNavPermissions,
} from "./nav-permissions"

const allow = (...granted: string[]) => {
  const set = new Set(granted)
  return (permission: string) => set.has(permission)
}
const allowAll = () => true
const allowNone = () => false

describe("nav permissions", () => {
  it("maps every path the core sidebar actually renders", () => {
    // The plan's Phase 3 item 2: an explicit page->resource map in ONE file,
    // with a test asserting every registered route is in it. Read out of
    // `useCoreRoutes` rather than re-listed, or this would assert a copy of the
    // list against the list.
    const source = readFileSync(
      join(__dirname, "../components/layout/main-layout/core-routes.tsx"),
      "utf8"
    )
    const block = source
      .slice(source.indexOf("const useCoreRoutes"))
      // Commented-out TODO entries are not rendered, so requiring a permission
      // for them would be requiring one for a screen that does not exist.
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n")
    const paths = [...block.matchAll(/\bto:\s*"(\/[a-z0-9-]+)"/g)].map((m) => m[1])

    expect(paths.length).toBeGreaterThan(10) // the extraction actually worked

    const unmapped = [...new Set(paths)].filter((p) => !permissionForPath(p)).sort()
    expect(unmapped).toEqual([])
  })

  it("treats an unknown path as visible rather than guessing", () => {
    // Deriving a permission from a path would hide screens nobody meant to
    // hide. Showing one too many costs a 403 the operator can read.
    expect(permissionForPath("/some-screen-nobody-mapped")).toBeNull()
    expect(
      isNavItemVisible({ to: "/some-screen-nobody-mapped" }, allowNone)
    ).toBe(true)
  })

  it("resolves a child path to its parent's permission, longest match winning", () => {
    expect(permissionForPath("/orders/manage")).toBe("order:read")
    // /customer-groups must not be swallowed by /customers.
    expect(permissionForPath("/customer-groups")).toBe("customer_group:read")
    expect(permissionForPath("/customers")).toBe("customer:read")
  })

  it("hides a top-level entry the operator cannot reach", () => {
    expect(isNavItemVisible({ to: "/payouts" }, allowNone)).toBe(false)
    expect(isNavItemVisible({ to: "/payouts" }, allow("payout:read"))).toBe(true)
  })

  it("keeps a parent visible when only a child is permitted", () => {
    // Granting `offer:read` alone must not hide Products and take Offers with it.
    const products = { to: "/products", items: [{ to: "/offers" }] }

    expect(isNavItemVisible(products, allow("offer:read"))).toBe(true)
    expect(isNavItemVisible(products, allowNone)).toBe(false)
  })

  it("shows everything while permissions are unknown", () => {
    // The provider passes a permissive checker while loading or on error, so
    // the panel never flashes empty and reads as "your access was revoked".
    expect(isNavItemVisible({ to: "/payouts" }, allowAll)).toBe(true)
  })

  describe("consumer registration", () => {
    beforeEach(() => {
      registerNavPermissions({ "/payout-requests": "payout_request:read" })
    })

    it("accepts paths this package cannot know about", () => {
      // A marketplace's own screens arrive through the menu-item system and
      // their paths are not knowable here.
      expect(permissionForPath("/payout-requests")).toBe("payout_request:read")
      expect(
        isNavItemVisible({ to: "/payout-requests" }, allow("payout_request:read"))
      ).toBe(true)
      expect(isNavItemVisible({ to: "/payout-requests" }, allowNone)).toBe(false)
    })

    it("lets a consumer override a default", () => {
      registerNavPermissions({ "/payouts": "payout_request:read" })
      expect(getNavPermissions()["/payouts"]).toBe("payout_request:read")
    })
  })

  describe("the settings sidebar", () => {
    it("maps every settings route the panel renders", () => {
      const source = readFileSync(
        join(__dirname, "../components/layout/settings-layout/settings-layout.tsx"),
        "utf8"
      )
      const paths = [
        ...source.matchAll(/\bto:\s*"(\/settings\/[a-z0-9-]+)"/g),
      ].map((m) => m[1])

      expect(paths.length).toBeGreaterThan(10)

      // `/settings/profile` is the deliberate exception below; everything else
      // must resolve.
      const unmapped = [...new Set(paths)]
        .filter((p) => p !== "/settings/profile")
        .filter((p) => !permissionForPath(p))
        .sort()

      expect(unmapped).toEqual([])
    })

    it("never hides the operator's own account page", () => {
      // Someone with the narrowest role must still reach their password and
      // their language. Filtering this out is a lockout dressed as tidiness.
      expect(permissionForPath("/settings/profile")).toBeNull()
      expect(isNavItemVisible({ to: "/settings/profile" }, allowNone)).toBe(true)
    })

    it("does not let a parent mapping swallow the profile page", () => {
      // If `/settings` were ever mapped, longest-match would still leave
      // /settings/profile unmapped only by accident. Pin the intent.
      expect(permissionForPath("/settings")).toBeNull()
    })

    it("hides a settings entry the operator cannot reach", () => {
      expect(isNavItemVisible({ to: "/settings/users" }, allowNone)).toBe(false)
      expect(
        isNavItemVisible({ to: "/settings/users" }, allow("user:read"))
      ).toBe(true)
    })
  })
})
