import {
  VendorCreateOffer,
  VendorCreateOffersBatch,
  VendorUpdateOffer,
} from "../validators"

// The pricing module charges the cheapest price a quantity is eligible for. A
// price dearer than one still eligible at its own minimum quantity is shown in
// the price table and never charged.
describe("offer prices may not rise with quantity", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schemaOf = (validator: any) =>
    typeof validator === "function" ? validator() : validator
  const update = (prices: unknown[]) =>
    schemaOf(VendorUpdateOffer).safeParse({ prices }).success
  const irr = (
    amount: number,
    min_quantity?: number,
    extra: Record<string, unknown> = {}
  ) => ({ amount, currency_code: "irr", min_quantity, ...extra })

  it("accepts a ladder that falls or stays level", () => {
    expect(update([irr(100), irr(90, 10), irr(90, 50), irr(80, 100)])).toBe(true)
    expect(update([irr(100)])).toBe(true)
    expect(update([])).toBe(true)
  })

  it("refuses a rung dearer than a smaller one", () => {
    expect(update([irr(100), irr(120, 10)])).toBe(false)
    expect(update([irr(120, 10), irr(100, 1), irr(90, 50)])).toBe(false)
  })

  it("compares only prices that can meet", () => {
    // Another currency, another rule set, or a band that ends before the
    // dearer one starts: the cheaper price is not eligible there.
    expect(update([irr(100), { ...irr(120, 10), currency_code: "usd" }])).toBe(
      true
    )
    expect(
      update([irr(100), irr(120, 10, { rules: { region_id: "reg_1" } })])
    ).toBe(true)
    expect(update([irr(100, 1, { max_quantity: 9 }), irr(120, 10)])).toBe(true)
    expect(update([irr(100, 1, { max_quantity: 10 }), irr(120, 10)])).toBe(false)
  })

  it("holds on create and on the batch", () => {
    const offer = {
      sku: "sku-1",
      variant_id: "variant_1",
      shipping_profile_id: "sp_1",
      inventory_items: [{}],
      prices: [irr(100), irr(120, 10)],
    }
    expect(schemaOf(VendorCreateOffer).safeParse(offer).success).toBe(false)
    expect(
      schemaOf(VendorCreateOffersBatch).safeParse({ offers: [offer] }).success
    ).toBe(false)
    offer.prices = [irr(100), irr(90, 10)]
    expect(schemaOf(VendorCreateOffer).safeParse(offer).success).toBe(true)
    expect(
      schemaOf(VendorCreateOffersBatch).safeParse({ offers: [offer] }).success
    ).toBe(true)
  })
})
