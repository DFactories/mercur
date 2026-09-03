import { describe, expect, it } from "vitest"

import {
  cartRequiredShippingProfileIds,
  describeUnkeepableShippingOptions,
  findUnkeepableShippingOptions,
  type CartItemForShippingParity,
} from "./shipping-profile-parity"

/**
 * The numbers here are the ones measured on cart `cart_01M1H8GK26WK2RREATG2PJTVYK`:
 * items on «سنگین» `sp_01KTYF5PK501N0VXGB58QCYK92`, every seller option on
 * «مرسولات سنگین/حجیم» `sp_01KVZKCTJWD8WG4SMDM3T8P49K`.
 */
const PRODUCT_PROFILE = "sp_01KTYF5PK501N0VXGB58QCYK92"
const OPTION_PROFILE = "sp_01KVZKCTJWD8WG4SMDM3T8P49K"

const item = (
  profileId: string | null,
  requiresShipping = true
): CartItemForShippingParity => ({
  requires_shipping: requiresShipping,
  variant: { product: { shipping_profile: profileId ? { id: profileId } : null } },
})

describe("cartRequiredShippingProfileIds", () => {
  it("collects the profile of every item that requires shipping", () => {
    const ids = cartRequiredShippingProfileIds([
      item(PRODUCT_PROFILE),
      item("sp_other"),
    ])

    expect(ids).toEqual(new Set([PRODUCT_PROFILE, "sp_other"]))
  })

  it("ignores an item that does not require shipping", () => {
    // Medusa filters on `requires_shipping` before it maps, so a digital line
    // keeps no carriage alive. Mirroring that is the whole point of this module.
    const ids = cartRequiredShippingProfileIds([item(PRODUCT_PROFILE, false)])

    expect(ids).toEqual(new Set())
  })

  it("ignores an item whose product has no profile", () => {
    expect(cartRequiredShippingProfileIds([item(null)])).toEqual(new Set())
  })

  it("is empty for no items at all", () => {
    expect(cartRequiredShippingProfileIds(undefined)).toEqual(new Set())
    expect(cartRequiredShippingProfileIds([])).toEqual(new Set())
  })
})

describe("findUnkeepableShippingOptions", () => {
  const options = [
    { id: "so_terabornt", name: "ترابرنت", shipping_profile_id: OPTION_PROFILE },
  ]

  it("refuses nothing while the cart would hold a single method", () => {
    // The live regression: one producer's carriage on a mismatched profile has
    // always worked, because Medusa's cull is gated on `length > 1`. Refusing
    // it would break a checkout that works today.
    expect(
      findUnkeepableShippingOptions({
        items: [item(PRODUCT_PROFILE)],
        options,
        resultingMethodCount: 1,
      })
    ).toEqual([])
  })

  it("names the option once a second producer's carriage would join it", () => {
    expect(
      findUnkeepableShippingOptions({
        items: [item(PRODUCT_PROFILE)],
        options,
        resultingMethodCount: 2,
      })
    ).toEqual([
      {
        id: "so_terabornt",
        name: "ترابرنت",
        shipping_profile_id: OPTION_PROFILE,
      },
    ])
  })

  it("keeps an option whose profile the cart does require", () => {
    expect(
      findUnkeepableShippingOptions({
        items: [item(OPTION_PROFILE)],
        options,
        resultingMethodCount: 2,
      })
    ).toEqual([])
  })

  it("keeps an option that carries no profile at all", () => {
    // Medusa's own branch is `profileId && !required.has(profileId)`, so a
    // profile-less option is never culled — inventing a refusal for it would
    // fail a cart Medusa is perfectly happy with.
    expect(
      findUnkeepableShippingOptions({
        items: [item(PRODUCT_PROFILE)],
        options: [{ id: "so_x", name: "x", shipping_profile_id: null }],
        resultingMethodCount: 2,
      })
    ).toEqual([])
  })

  it("refuses when the cart requires no profile at all", () => {
    // Every item digital, or every product unlinked: `requiredProfileIds` is
    // empty and Medusa culls every method once there is more than one.
    expect(
      findUnkeepableShippingOptions({
        items: [item(PRODUCT_PROFILE, false)],
        options,
        resultingMethodCount: 2,
      })
    ).toHaveLength(1)
  })

  it("reports each mismatched option, not only the first", () => {
    const found = findUnkeepableShippingOptions({
      items: [item(PRODUCT_PROFILE)],
      options: [
        { id: "so_a", name: "باربری", shipping_profile_id: OPTION_PROFILE },
        { id: "so_b", name: "ترابرنت", shipping_profile_id: "sp_third" },
      ],
      resultingMethodCount: 3,
    })

    expect(found.map((o) => o.id)).toEqual(["so_a", "so_b"])
  })
})

describe("describeUnkeepableShippingOptions", () => {
  it("names the option, its profile, and what the cart requires", () => {
    const message = describeUnkeepableShippingOptions(
      [
        {
          id: "so_terabornt",
          name: "ترابرنت",
          shipping_profile_id: OPTION_PROFILE,
        },
      ],
      new Set([PRODUCT_PROFILE])
    )

    // All three are load-bearing: without the option nobody knows which row,
    // without both profiles nobody knows which of the two edits to make.
    expect(message).toContain("ترابرنت")
    expect(message).toContain(OPTION_PROFILE)
    expect(message).toContain(PRODUCT_PROFILE)
  })

  it("says «none» rather than an empty list when the cart requires nothing", () => {
    const message = describeUnkeepableShippingOptions(
      [{ id: "so_a", name: "", shipping_profile_id: OPTION_PROFILE }],
      new Set()
    )

    expect(message).toContain("none")
    // With no name the id has to carry the identification.
    expect(message).toContain("so_a")
  })
})
