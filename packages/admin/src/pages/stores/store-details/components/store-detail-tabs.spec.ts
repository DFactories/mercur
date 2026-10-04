import { describe, expect, it } from "vitest"

import { resolveActiveTab, visibleStoreTabs } from "./store-detail-tabs"

const grants = (list: string[]) => (permission: string) => list.includes(permission)

describe("visibleStoreTabs", () => {
  it("offers every tab to an operator holding every grant", () => {
    expect(visibleStoreTabs(grants(["order:read", "offer:read", "seller_member:read"]))).toEqual([
      "orders",
      "offers",
      "users",
      "timeOff",
    ])
  })

  it("hides the orders tab from an operator who may not read orders", () => {
    expect(visibleStoreTabs(grants(["offer:read", "seller_member:read"]))).toEqual([
      "offers",
      "users",
      "timeOff",
    ])
  })
})

describe("resolveActiveTab", () => {
  it("opens the first tab the operator may see", () => {
    expect(resolveActiveTab(null, ["users", "timeOff"])).toEqual("users")
  })

  it("keeps a chosen tab while it stays visible, and drops it when it does not", () => {
    expect(resolveActiveTab("timeOff", ["users", "timeOff"])).toEqual("timeOff")
    expect(resolveActiveTab("orders", ["users", "timeOff"])).toEqual("users")
  })
})
