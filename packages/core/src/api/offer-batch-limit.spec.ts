import { describe, expect, it } from "vitest"

import { vendorOffersMiddlewares } from "./vendor/offers/middlewares"
import {
  VENDOR_OFFERS_BATCH_MAX,
  VendorCreateOffersBatch,
} from "./vendor/offers/validators"

/**
 * On 2026-10-14 a producer priced a whole catalogue in «ایجاد پیشنهاد» while
 * on a call with us, ticked more than 100 rows and pressed «ثبت» three times:
 * every attempt came back `Value for field 'offers' too big, expected at most:
 * '100'` and nothing was saved. The form sends every ticked row in one
 * request, so the cap — not the producer — decided how much work was lost.
 *
 * Two limits guard this route and both must leave room for a real catalogue:
 * the row cap in the validator and the JSON body size (100 KB by default,
 * roughly 150 of these rows).
 */

/** One row exactly as the create-offer form builds it. */
const row = (i: number) => ({
  sku: `AL-${String(i).padStart(4, "0")}`,
  variant_id: `variant_01M4DJZWAR9WCKQXC0P18E${String(i).padStart(4, "0")}`,
  shipping_profile_id: "sp_01KYEY1RF2Z1W3DJ6DVDWEFFD3",
  prices: [{ amount: 55_000_000, currency_code: "irr" }],
  inventory_items: [
    {
      title: "ظرف یکبار مصرف آلومینیومی دو پرس درب دار",
      stock_levels: [
        { location_id: "sloc_01KYEY1RF2Z1W3DJ6DVDWEFFD3", stocked_quantity: 1000 },
      ],
    },
  ],
})

const batch = (n: number) => ({
  offers: Array.from({ length: n }, (_, i) => row(i)),
})

describe("POST /vendor/offers/batch row cap", () => {
  it("accepts the 2026-10-14 batch of more than 100 rows", () => {
    expect(() => VendorCreateOffersBatch().parse(batch(150))).not.toThrow()
  })

  it("accepts a full batch", () => {
    expect(() =>
      VendorCreateOffersBatch().parse(batch(VENDOR_OFFERS_BATCH_MAX))
    ).not.toThrow()
  })

  it("still refuses a batch over the cap", () => {
    expect(() =>
      VendorCreateOffersBatch().parse(batch(VENDOR_OFFERS_BATCH_MAX + 1))
    ).toThrow()
  })
})

describe("POST /vendor/offers/batch body size", () => {
  const route = vendorOffersMiddlewares.find(
    (r) =>
      r.matcher === "/vendor/offers/batch" &&
      ([] as string[]).concat(r.method ?? []).includes("POST")
  )

  const toBytes = (limit: string) => {
    const match = /^(\d+)(kb|mb)$/i.exec(limit)
    if (!match) throw new Error(`unparsed size limit ${limit}`)
    return Number(match[1]) * (match[2].toLowerCase() === "mb" ? 1024 ** 2 : 1024)
  }

  it("raises the body limit enough for a full batch", () => {
    const config = route?.bodyParser
    const sizeLimit =
      config && typeof config === "object" ? config.sizeLimit : undefined
    expect(typeof sizeLimit).toBe("string")

    const fullBatchBytes = Buffer.byteLength(
      JSON.stringify(batch(VENDOR_OFFERS_BATCH_MAX))
    )
    expect(fullBatchBytes).toBeLessThan(toBytes(sizeLimit as string))
  })
})
