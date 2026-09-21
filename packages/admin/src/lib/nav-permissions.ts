/**
 * Which permission a sidebar entry requires, by path.
 *
 * ## This is a courtesy, never a control
 *
 * Hiding a nav item is a convenience for the operator; the server 403 is what
 * actually stops anything. Every entry here must ALSO be enforced by a
 * `policies` declaration on the route — see `api/admin/_policies/resources.ts`.
 * A path that is hidden but not enforced is a lie, and a path that is enforced
 * but not hidden is merely untidy. Only the first is a bug.
 *
 * That asymmetry is also why an unmapped path defaults to VISIBLE. Guessing a
 * permission from a path would hide screens nobody meant to hide, and the cost
 * of showing one too many is a 403 the operator can understand.
 *
 * ## Consumers extend it rather than editing it
 *
 * The panel's own routes are mapped below. A marketplace built on this package
 * adds its own screens through the menu-item system, and their paths are not
 * knowable here — `registerNavPermissions` is how it contributes them, from its
 * app entry, before the sidebar first renders.
 */
const CORE_NAV_PERMISSIONS: Record<string, string> = {
  "/orders": "order:read",
  "/products": "product:read",
  "/offers": "offer:read",
  "/collections": "product_collection:read",
  "/categories": "product_category:read",
  "/inventory": "inventory_item:read",
  "/reservations": "reservation_item:read",
  "/customers": "customer:read",
  "/customer-groups": "customer_group:read",
  "/promotions": "promotion:read",
  "/campaigns": "campaign:read",
  "/price-lists": "price_list:read",
  // "Stores" is the seller list on a marketplace, not Medusa's `store` config.
  "/stores": "seller:read",
  "/reviews": "review:read",
  "/payouts": "payout:read",

  // -- the settings sidebar --
  //
  // `/settings/profile` is deliberately ABSENT and must stay that way: it is
  // the operator's own account, and hiding it would leave someone with a
  // narrow role unable to reach their own password or language. `/settings`
  // itself is absent for the same reason — it is the container those live in.
  "/settings/marketplace": "store:read",
  "/settings/users": "user:read",
  "/settings/regions": "region:read",
  "/settings/tax-regions": "tax_region:read",
  "/settings/return-reasons": "return_reason:read",
  "/settings/refund-reasons": "refund_reason:read",
  "/settings/sales-channels": "sales_channel:read",
  "/settings/product-types": "product_type:read",
  "/settings/product-tags": "product_tag:read",
  "/settings/attributes": "product_attribute:read",
  "/settings/locations": "stock_location:read",
  "/settings/commissions": "commission_rate:read",
  "/settings/notifications": "notification_setting:read",
  "/settings/publishable-api-keys": "api_key:read",
  "/settings/secret-api-keys": "api_key:read",
}

const registered: Record<string, string> = { ...CORE_NAV_PERMISSIONS }

/**
 * Contribute nav permissions for screens this package does not know about.
 *
 * Call it once, from the app entry, before the sidebar renders. Later calls
 * merge, so a consumer may also override one of the defaults above.
 */
export function registerNavPermissions(map: Record<string, string>): void {
  Object.assign(registered, map)
}

/** Exposed for tests; not part of the panel's runtime contract. */
export function getNavPermissions(): Record<string, string> {
  return { ...registered }
}

/**
 * The permission a path requires, or `null` when it requires none.
 *
 * Longest match wins, so `/orders/drafts` inherits `/orders` unless it was
 * mapped separately.
 */
export function permissionForPath(to: string): string | null {
  if (registered[to]) {
    return registered[to]
  }

  let best: string | null = null
  for (const path of Object.keys(registered)) {
    if (to === path || to.startsWith(`${path}/`)) {
      if (!best || path.length > best.length) {
        best = path
      }
    }
  }

  return best ? registered[best] : null
}

/** Whether a path's own permission, if it has one, is held. */
export function canOpenPath(
  to: string,
  hasPermission: (permission: string) => boolean
): boolean {
  const required = permissionForPath(to)
  return !required || hasPermission(required)
}

/**
 * Whether a nav entry should be shown.
 *
 * A parent stays visible when any of its children is permitted, even if the
 * parent's own screen is not — otherwise granting `offer:read` alone would hide
 * Products and take Offers down with it.
 */
export function isNavItemVisible(
  item: { to: string; items?: { to: string }[] },
  hasPermission: (permission: string) => boolean
): boolean {
  if (canOpenPath(item.to, hasPermission)) {
    return true
  }

  return (item.items ?? []).some((child) => canOpenPath(child.to, hasPermission))
}

export type RouteAccess = "allow" | "deny" | "pending"

/**
 * Whether the operator may open `pathname`.
 *
 * `pending` exists because the sidebar and a route need opposite things from
 * the same unresolved state. The sidebar renders in full while permissions
 * load, so it never flashes empty. A route cannot: mounting the page fires its
 * queries, and a list that 403s throws during render, which is an error page
 * rather than a refusal. So the route waits, and only the sidebar guesses.
 *
 * A FAILED permissions request still allows — same reason as the sidebar. The
 * server refuses either way; blanking the panel over an unreachable courtesy
 * endpoint would not.
 */
export function routeAccess(input: {
  pathname: string
  hasPermission: (permission: string) => boolean
  isLoading: boolean
  isUnavailable: boolean
}): RouteAccess {
  if (!permissionForPath(input.pathname)) {
    return "allow"
  }

  if (input.isUnavailable) {
    return "allow"
  }

  if (input.isLoading) {
    return "pending"
  }

  return canOpenPath(input.pathname, input.hasPermission) ? "allow" : "deny"
}

/**
 * The first entry in a nav list the operator can actually open.
 *
 * Used to land somebody somewhere that works instead of on the platform's
 * default screen, which for a narrow role is a 403. Children count: an
 * operator granted `offer:read` alone belongs on Offers, not nowhere.
 */
export function firstReachablePath(
  items: { to: string; items?: { to: string }[] }[],
  hasPermission: (permission: string) => boolean
): string | null {
  for (const item of items) {
    if (canOpenPath(item.to, hasPermission)) {
      return item.to
    }

    const child = (item.items ?? []).find((entry) =>
      canOpenPath(entry.to, hasPermission)
    )

    if (child) {
      return child.to
    }
  }

  return null
}
