export const STORE_TABS = ["orders", "offers", "users", "timeOff"] as const

export type StoreTab = (typeof STORE_TABS)[number]

// The grant each tab's own list needs. A tab whose list the operator may not
// read is not offered: its section throws on the 403, and the orders tab is the
// one that opens first.
const TAB_PERMISSION: Record<StoreTab, string | null> = {
  orders: "order:read",
  offers: "offer:read",
  users: "seller_member:read",
  timeOff: null,
}

export const visibleStoreTabs = (
  canFetch: (permission: string) => boolean
): StoreTab[] =>
  STORE_TABS.filter((tab) => {
    const permission = TAB_PERMISSION[tab]
    return !permission || canFetch(permission)
  })

export const resolveActiveTab = (
  selected: StoreTab | null,
  visible: StoreTab[]
): StoreTab | null =>
  selected && visible.includes(selected) ? selected : (visible[0] ?? null)
