import { describe, expect, it } from "vitest"

import {
  getNotificationEvent,
  listNotificationEvents,
  notificationEventCategory,
  notificationEventPriority,
  orderNotificationMoney,
} from "./catalog"

/**
 * What an order-confirmation message says about money.
 *
 * Production order #1 was placed for 120,000 rial — 12,000 toman — and the SMS
 * that went out read `total: "0"`, `currency: "irr"`. Both halves were wrong:
 * the amount because `resolveOrderCustomer` asked Medusa for `total` alongside
 * `items.id`, a narrow sub-selection that zeroes the computed totals; and the
 * unit because the raw ISO code was passed through to a reader who has never
 * quoted a price in rial.
 */

describe("orderNotificationMoney", () => {
  it("quotes an Iranian order in toman, not rial", () => {
    // The real production order: 120,000 rial is 12,000 toman.
    expect(orderNotificationMoney(120_000, "irr")).toEqual({
      total: "12,000",
      currency: "تومان",
    })
  })

  it("groups the digits so an SMS can be read at a glance", () => {
    // "1,955,000" rather than "1955000", which invites a miscount by a factor
    // of ten — the exact error this message is meant to avoid.
    expect(orderNotificationMoney(19_550_000, "irr").total).toBe("1,955,000")
  })

  it("never emits the ISO code to an Iranian reader", () => {
    const { currency } = orderNotificationMoney(120_000, "IRR")
    expect(currency).toBe("تومان")
    expect(currency.toLowerCase()).not.toContain("irr")
  })

  it("matches on the currency case-insensitively", () => {
    // Medusa stores `irr`, but callers and fixtures write `IRR` freely; a
    // case-sensitive check would silently skip the conversion and ship rial.
    expect(orderNotificationMoney(120_000, "IRR").total).toBe("12,000")
  })

  it("rounds to whole toman rather than showing a fraction", () => {
    // 1,205 rial is 120.5 toman; an SMS must not read "120.5 تومان".
    expect(orderNotificationMoney(1_205, "irr").total).toBe("121")
  })

  it("leaves a non-Iranian currency alone", () => {
    // The divide-by-ten is an IRR fact. Applying it to USD would understate
    // every amount tenfold, so other deployments must pass straight through.
    expect(orderNotificationMoney(4_999, "usd")).toEqual({
      total: "4,999",
      currency: "USD",
    })
  })

  it.each([
    ["null", null],
    ["undefined", undefined],
  ])("treats a missing total (%s) as zero rather than NaN", (_label, total) => {
    // `Number(null) || 0` guards this: "NaN تومان" would be worse than "0".
    expect(orderNotificationMoney(total, "irr").total).toBe("0")
  })

  it("survives a missing currency without inventing one", () => {
    expect(orderNotificationMoney(500, null)).toEqual({
      total: "500",
      currency: "",
    })
  })
})

/**
 * Category and priority: the two fields the feed is sorted, filtered and
 * badged on.
 *
 * Both default rather than being required, because a `registerNotificationEvent`
 * call that forgets them must still boot — a marketplace does not go down over
 * a missing label. What must NOT happen is an un-declared event quietly landing
 * in the operator's "needs action" tab, so the defaults are the harmless
 * corner: an uncategorised event is `system` / `info`, visible but never urgent.
 */
describe("notification event category & priority", () => {
  it("defaults an event that declares neither to the harmless corner", () => {
    expect(notificationEventCategory({ category: undefined })).toBe("system")
    expect(notificationEventPriority({ priority: undefined })).toBe("info")
  })

  it("keeps what the event declared", () => {
    expect(notificationEventCategory({ category: "approval" })).toBe("approval")
    expect(notificationEventPriority({ priority: "action_required" })).toBe(
      "action_required"
    )
  })

  it("marks a suspended store as needing action and a placed order as not", () => {
    // The pair that shows the rule: a suspension is a store gone dark until
    // somebody acts; an order confirmation is a receipt.
    const suspended = getNotificationEvent("seller.suspended")
    const placed = getNotificationEvent("order.placed")

    expect(notificationEventPriority(suspended!)).toBe("action_required")
    expect(notificationEventPriority(placed!)).toBe("info")
    expect(notificationEventCategory(placed!)).toBe("commerce")
  })

  it("gives every built-in event a category, so the default is never load-bearing", () => {
    // The defaults exist for host-registered events during development. A
    // shipped event that relies on them is an oversight, and this catches it.
    const uncategorised = listNotificationEvents().filter((e) => !e.category)
    expect(uncategorised.map((e) => e.key)).toEqual([])
  })
})
