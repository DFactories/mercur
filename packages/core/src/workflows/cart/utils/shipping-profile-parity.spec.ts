import { describe, expect, it } from "vitest"

import {
  cartRequiredShippingProfileIds,
  describeShippingOptionsWithoutGoods,
  findShippingOptionsWithoutGoods,
  type CartItemForShippingParity,
} from "./shipping-profile-parity"

/**
 * The profile ids are the ones measured on cart `cart_01M1H8GK26WK2RREATG2PJTVYK`:
 * goods on «سنگین» `sp_01KTYF5PK501N0VXGB58QCYK92`, every seller option on
 * «مرسولات سنگین/حجیم» `sp_01KVZKCTJWD8WG4SMDM3T8P49K`.
 */
const OFFER_PROFILE = "sp_01KTYF5PK501N0VXGB58QCYK92"
const OPTION_PROFILE = "sp_01KVZKCTJWD8WG4SMDM3T8P49K"

const item = (
  offerProfileId: string | null,
  requiresShipping = true
): CartItemForShippingParity => ({
  requires_shipping: requiresShipping,
  offer: offerProfileId ? { shipping_profile_id: offerProfileId } : null,
})

describe("cartRequiredShippingProfileIds", () => {
  it("collects the OFFER profile of every item that requires shipping", () => {
    const ids = cartRequiredShippingProfileIds([
      item(OFFER_PROFILE),
      item("sp_other"),
    ])

    expect(ids).toEqual(new Set([OFFER_PROFILE, "sp_other"]))
  })

  it("never reads the product's profile", () => {
    // On a shared master product the product↔profile link belongs to the
    // FIRST offerer; a second seller's line must still ask for its own offer's
    // profile.
    const ids = cartRequiredShippingProfileIds([
      {
        requires_shipping: true,
        offer: { shipping_profile_id: "sp_seller_b" },
        variant: { product: { shipping_profile: { id: "sp_seller_a" } } },
      } as CartItemForShippingParity,
    ])

    expect(ids).toEqual(new Set(["sp_seller_b"]))
  })

  it("ignores an item that does not require shipping", () => {
    // Completion filters on `requires_shipping` first, so a digital line
    // asks for no carriage.
    const ids = cartRequiredShippingProfileIds([item(OFFER_PROFILE, false)])

    expect(ids).toEqual(new Set())
  })

  it("ignores an item without an offer", () => {
    expect(cartRequiredShippingProfileIds([item(null)])).toEqual(new Set())
  })

  it("is empty for no items at all", () => {
    expect(cartRequiredShippingProfileIds(undefined)).toEqual(new Set())
    expect(cartRequiredShippingProfileIds([])).toEqual(new Set())
  })
})

describe("findShippingOptionsWithoutGoods", () => {
  const options = [
    { id: "so_terabornt", name: "ترابرنت", shipping_profile_id: OPTION_PROFILE },
  ]

  it("names an option on a profile none of the cart's offers use", () => {
    // Even as the cart's only carriage: completion checks every shipping line
    // against the methods' profiles, however many methods there are.
    expect(
      findShippingOptionsWithoutGoods({
        items: [item(OFFER_PROFILE)],
        options,
      })
    ).toEqual([
      {
        id: "so_terabornt",
        name: "ترابرنت",
        shipping_profile_id: OPTION_PROFILE,
      },
    ])
  })

  it("keeps an option whose profile an offer in the cart uses", () => {
    expect(
      findShippingOptionsWithoutGoods({
        items: [item(OFFER_PROFILE), item(OPTION_PROFILE)],
        options,
      })
    ).toEqual([])
  })

  it("keeps an option that carries no profile at all", () => {
    expect(
      findShippingOptionsWithoutGoods({
        items: [item(OFFER_PROFILE)],
        options: [{ id: "so_x", name: "x", shipping_profile_id: null }],
      })
    ).toEqual([])
  })

  it("refuses nothing when no line requires shipping", () => {
    // Completion asks no profile of such a cart, so refusing a carriage here
    // would fail a checkout that works.
    expect(
      findShippingOptionsWithoutGoods({
        items: [item(OFFER_PROFILE, false)],
        options,
      })
    ).toEqual([])
  })

  it("reports each mismatched option, not only the first", () => {
    const found = findShippingOptionsWithoutGoods({
      items: [item(OFFER_PROFILE)],
      options: [
        { id: "so_a", name: "باربری", shipping_profile_id: OPTION_PROFILE },
        { id: "so_b", name: "ترابرنت", shipping_profile_id: "sp_third" },
      ],
    })

    expect(found.map((o) => o.id)).toEqual(["so_a", "so_b"])
  })
})

describe("describeShippingOptionsWithoutGoods", () => {
  it("names the option, its profile, and what the cart's offers use", () => {
    const message = describeShippingOptionsWithoutGoods(
      [
        {
          id: "so_terabornt",
          name: "ترابرنت",
          shipping_profile_id: OPTION_PROFILE,
        },
      ],
      new Set([OFFER_PROFILE])
    )

    // All three are load-bearing: without the option nobody knows which row,
    // without both profiles nobody knows which of the two edits to make.
    expect(message).toContain("ترابرنت")
    expect(message).toContain(OPTION_PROFILE)
    expect(message).toContain(OFFER_PROFILE)
  })

  it("says «none» rather than an empty list when the cart requires nothing", () => {
    const message = describeShippingOptionsWithoutGoods(
      [{ id: "so_a", name: "", shipping_profile_id: OPTION_PROFILE }],
      new Set()
    )

    expect(message).toContain("none")
    // With no name the id has to carry the identification.
    expect(message).toContain("so_a")
  })
})
