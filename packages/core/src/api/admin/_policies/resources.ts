/**
 * Marketplace-specific admin resources, and the URL prefixes they live at.
 *
 * ## Why this list is short
 *
 * Most of `api/admin/**` here re-exposes a resource Medusa already registers,
 * and core already guards those prefixes with its own **methodless** wildcard
 * entries — `/admin/orders/*` with `order:read`, `/admin/products/*` with
 * `product:read`, and so on for all 14 shared prefixes (verified 2026-09-19).
 * Re-declaring them would be a duplicate that has to be kept in step with core
 * forever, and the first time it drifted it would drift silently.
 *
 * What is left is the set below: resources that exist only in this marketplace,
 * whose routes core has never heard of and therefore does not cover.
 *
 * ## Order matters
 *
 * Longest prefix first within a family, or the broader entry claims the finer
 * one's routes and the narrower resource is never enforced on them.
 */
export const ADMIN_RESOURCE_PREFIXES: Record<string, string | string[]> = {
  seller: "/admin/sellers",
  seller_member: "/admin/members",
  offer: "/admin/offers",
  payout: "/admin/payouts",
  review: "/admin/reviews",
  commission_rate: "/admin/commission-rates",
  order_group: "/admin/order-groups",
  product_attribute: "/admin/product-attributes",
  product_change: "/admin/product-changes",
  shipping_template: "/admin/shipping-templates",
  notification_setting: "/admin/notification-settings",
  /**
   * Marking a notification read. `notification` is CORE's resource, not one of
   * ours — core guards `/admin/notifications/*` with it, but this package added
   * a sibling prefix core has never heard of, so it needs declaring here.
   */
  notification: "/admin/notification-read-state",
}
