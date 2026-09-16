import { describe, expect, it } from "vitest"

import { AdminCreateOffersBatch } from "./admin/offers/validators"
import {
  VendorCreateOffer,
  VendorCreateOffersBatch,
  VendorUpdateOffer,
} from "./vendor/offers/validators"

/**
 * No offer price write may accept a non-positive amount. Any of them.
 *
 * On 2026-08-03 every card in the production catalogue printed «۰ تومان» while
 * the database held correct tiered prices. Each product had three variants and
 * therefore three offers; the producer priced one, and the panel coerced the
 * two blank price fields to `0`. The storefront's card price is the cheapest
 * offer's entry tier, so `0` won every comparison — and it poisoned the card
 * MOQ, the search index's `price.irr` sort key and the PDP's default offer
 * along with it.
 *
 * The fix landed in three layers on 2026-08-04 and **missed the admin route**:
 * `AdminOfferPrice.amount` stayed `z.number()` while the vendor side became
 * `z.number().positive()`. Nobody noticed because operators rarely priced
 * offers by hand — which stops being true the moment operators enter prices on
 * a producer's behalf during assisted onboarding.
 *
 * So this suite asserts the rule across EVERY surface rather than at the one
 * that was reported, and a new surface added without the guard fails here.
 */

const price = (amount: number) => ({
  amount,
  currency_code: "irr",
})

/** A complete, otherwise-valid offer, so only the amount is under test. */
const offerBody = (amount: number) => ({
  sku: "SKU-1",
  variant_id: "variant_1",
  shipping_profile_id: "sp_1",
  inventory_items: [{ required_quantity: 1 }],
  prices: [price(amount)],
})

/**
 * `WithAdditionalData(schema)` returns a FACTORY, not a schema — calling it is
 * what produces something with `.parse`. Reaching for `.parse` directly throws
 * a TypeError, which `expect(...).toThrow()` happily accepts: the rejection
 * cases here passed for entirely the wrong reason until the "accepts a real
 * amount" case exposed it. That positive case is why it is in this file.
 */
const surfaces: { name: string; parse: (amount: number) => unknown }[] = [
  {
    name: "POST /vendor/offers",
    parse: (amount) => VendorCreateOffer().parse(offerBody(amount)),
  },
  {
    name: "POST /vendor/offers/:id",
    parse: (amount) => VendorUpdateOffer().parse({ prices: [price(amount)] }),
  },
  {
    name: "POST /vendor/offers/batch",
    parse: (amount) =>
      VendorCreateOffersBatch().parse({ offers: [offerBody(amount)] }),
  },
  {
    name: "POST /admin/offers/batch",
    parse: (amount) =>
      AdminCreateOffersBatch().parse({
        seller_id: "sel_1",
        offers: [offerBody(amount)],
      }),
  },
]

describe.each(surfaces)("$name", ({ parse }) => {
  it("rejects an amount of 0", () => {
    // The exact value the panel used to send for a blank price field.
    expect(() => parse(0)).toThrow()
  })

  it("rejects a negative amount", () => {
    expect(() => parse(-1)).toThrow()
  })

  it("accepts a real amount", () => {
    // Guards against the rule being satisfied by a schema that rejects
    // everything — a validator nobody can post to is not a fix.
    expect(() => parse(55_000_000)).not.toThrow()
  })
})
