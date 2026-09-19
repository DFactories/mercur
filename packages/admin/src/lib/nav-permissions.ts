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
  const own = permissionForPath(item.to)
  if (!own || hasPermission(own)) {
    return true
  }

  return (item.items ?? []).some((child) => {
    const childPermission = permissionForPath(child.to)
    return !childPermission || hasPermission(childPermission)
  })
}
