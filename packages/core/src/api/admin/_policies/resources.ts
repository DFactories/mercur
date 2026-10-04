/**
 * The admin URL prefixes this package guards, and the resource each needs.
 *
 * ## Two kinds of entry
 *
 * Marketplace resources (sellers, offers, payouts, …) exist only here, so
 * nothing else could guard them.
 *
 * The CORE prefixes below them are Medusa's own resources (`product`, `order`,
 * …) on routes this package replaces. `utils/disable-medusa-middlewares.ts`
 * empties Medusa's middleware arrays for exactly those groups so the
 * replacements can take over — and Medusa's policy guards live in those same
 * arrays, so they went with them. Until `2.3.1-dfactories.34` the comment here
 * said core still guarded these prefixes; it did not, and any signed-in admin
 * could read every order and edit any product whatever their role. Each prefix
 * listed in `CORE_RESOURCE_PREFIXES` must match an entry in that OVERRIDES list
 * (`core-prefix-coverage.spec.ts` checks it).
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
  offer_draft: "/admin/offer-drafts",
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

/**
 * Medusa resources on the admin groups whose Medusa middlewares this package
 * disables (see `utils/disable-medusa-middlewares.ts`). Keys are Medusa's own
 * policy resources, so nothing needs defining — only declaring.
 */
export const CORE_RESOURCE_PREFIXES: Record<string, string> = {
  product: "/admin/products",
  product_variant: "/admin/product-variants",
  product_category: "/admin/product-categories",
  product_collection: "/admin/collections",
  promotion: "/admin/promotions",
  campaign: "/admin/campaigns",
  price_list: "/admin/price-lists",
  customer_group: "/admin/customer-groups",
  order: "/admin/orders",
  shipping_option: "/admin/shipping-options",
  shipping_profile: "/admin/shipping-profiles",
  stock_location: "/admin/stock-locations",
  reservation_item: "/admin/reservations",
  inventory_item: "/admin/inventory-items",
}

