import { describe, expect, it } from "vitest"

import { resolvePromotionCostShares } from "./resolve-promotion-cost-shares"

/**
 * The number this returns decides how much of a discount comes off a seller's
 * commission base, and it is now read by two systems that bill the same vendor
 * net: the platform commission in this package, and the agent referral
 * commission in dfactories-mp. If the two ever resolve a promotion differently,
 * one order tells two stories about who paid for the discount and both sides
 * report success — so the mapping is pinned rather than left to the integration
 * suite, which only exercises the default bearer.
 *
 * The default is the load-bearing part. A promotion with no `promotion_cost`
 * record resolves to `marketplace`, NOT to the column's own `store` default:
 * charging on the discounted amount is the behaviour the marketplace wants by
 * default, and making the seller carry the whole discount is something an
 * operator opts into.
 */
const containerWith = (
  costs: Array<{
    promotion_id: string
    cost_bearer: string
    shared_marketplace_percentage?: number | null
  }>
) =>
  ({
    resolve: () => ({
      listPromotionCosts: async ({ promotion_id }: { promotion_id: string[] }) =>
        costs.filter((c) => promotion_id.includes(c.promotion_id)),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any

describe("resolvePromotionCostShares", () => {
  it("gives an unrecorded promotion to the marketplace, not the store", () => {
    return expect(
      resolvePromotionCostShares(containerWith([]), ["promo_1"])
    ).resolves.toEqual({ promo_1: 1 })
  })

  it("maps marketplace to the whole discount and store to none of it", async () => {
    const shares = await resolvePromotionCostShares(
      containerWith([
        { promotion_id: "promo_m", cost_bearer: "marketplace" },
        { promotion_id: "promo_s", cost_bearer: "store" },
      ]),
      ["promo_m", "promo_s"]
    )

    expect(shares).toEqual({ promo_m: 1, promo_s: 0 })
  })

  it("reads the declared percentage for a shared bearer", async () => {
    const shares = await resolvePromotionCostShares(
      containerWith([
        {
          promotion_id: "promo_x",
          cost_bearer: "shared",
          shared_marketplace_percentage: 40,
        },
      ]),
      ["promo_x"]
    )

    expect(shares).toEqual({ promo_x: 0.4 })
  })

  it("falls back to marketplace when a shared bearer declares no percentage", async () => {
    const shares = await resolvePromotionCostShares(
      containerWith([
        {
          promotion_id: "promo_x",
          cost_bearer: "shared",
          shared_marketplace_percentage: null,
        },
      ]),
      ["promo_x"]
    )

    expect(shares).toEqual({ promo_x: 1 })
  })

  it("clamps a percentage outside 0..100", async () => {
    const shares = await resolvePromotionCostShares(
      containerWith([
        {
          promotion_id: "promo_hi",
          cost_bearer: "shared",
          shared_marketplace_percentage: 250,
        },
        {
          promotion_id: "promo_lo",
          cost_bearer: "shared",
          shared_marketplace_percentage: -30,
        },
      ]),
      ["promo_hi", "promo_lo"]
    )

    expect(shares).toEqual({ promo_hi: 1, promo_lo: 0 })
  })

  it("does not touch the promotion-cost module when there is nothing to resolve", async () => {
    // A container that throws on resolve: an order with no promotions must not
    // depend on the module being registered at all.
    const hostile = {
      resolve: () => {
        throw new Error("should not resolve")
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    await expect(resolvePromotionCostShares(hostile, [])).resolves.toEqual({})
    await expect(
      // an order whose adjustments carry no promotion id
      resolvePromotionCostShares(hostile, [undefined as unknown as string])
    ).resolves.toEqual({})
  })

  it("deduplicates repeated promotion ids", async () => {
    const shares = await resolvePromotionCostShares(
      containerWith([{ promotion_id: "promo_1", cost_bearer: "store" }]),
      ["promo_1", "promo_1", "promo_1"]
    )

    expect(shares).toEqual({ promo_1: 0 })
  })
})
