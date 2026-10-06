import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  IPricingModuleService,
  IRegionModuleService,
  ISalesChannelModuleService,
  MedusaContainer,
} from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { MercurModules, SellerStatus } from "@mercurjs/types"
import { createSellerUser } from "../../helpers/create-seller-user"
import { createVendorProduct } from "../../helpers/create-product"
import {
  generatePublishableKey,
  generateStoreHeaders,
} from "../../helpers/create-admin-user"

/**
 * REGRESSION — a seller's price list may only price that seller's own offers.
 *
 * Every offer on a master variant shares the variant's ONE price set; an
 * offer's rows are told apart only by an `offer_id` price rule. Medusa's
 * pricing query treats a price with no rules as matching any context and sorts
 * price-list rows first, so an active price-list price without `offer_id` in a
 * shared price set wins for EVERY offer on the variant — on the product page
 * and in the cart alike.
 *
 * Up to core `2.3.1-dfactories.35` the vendor price-list routes checked only
 * that the price LIST belonged to the seller. `rules` was optional, nothing
 * tied the price's variant to the seller's offers, and the batch route passed
 * `update` / `delete` price ids straight to Medusa, which reads them without
 * the list. The vendor panel always sent `offer_id`, so the hole was reachable
 * through the API (and older panel builds); the local dev DB held such rows on
 * a variant two producers share.
 *
 * The contract now:
 *   - a price is pinned to the seller's own offer on its variant: added when
 *     omitted, refused when it names someone else's offer;
 *   - a variant the seller has no offer on cannot be priced;
 *   - with several own offers on a variant, the caller must say which;
 *   - `update` / `delete` only touch prices that are in this price list, and an
 *     edited row is re-pinned, so an old unscoped row heals when it is saved.
 */

jest.setTimeout(180000)

type Seller = {
  id: string
  headers: any
  locationId: string
  profileId: string
}

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    describe("Vendor - price-list prices are scoped to the seller's offers", () => {
      let appContainer: MedusaContainer
      let storeHeaders: any
      let region: any
      let salesChannel: any
      let sellerA: Seller
      let sellerB: Seller
      let variantId: string
      let priceSetId: string
      let offerA: any
      let offerB: any
      let seq = 0

      const approveSeller = async (sellerId: string) => {
        const sellerModule: any = appContainer.resolve(MercurModules.SELLER)
        await sellerModule.updateSellers({
          id: sellerId,
          status: SellerStatus.OPEN,
        })
      }

      const setUpSeller = async (email: string, name: string): Promise<Seller> => {
        const created = await createSellerUser(appContainer, { email, name })
        const id = (created.seller as { id: string }).id
        await approveSeller(id)

        const location = (
          await api.post(
            `/vendor/stock-locations`,
            { name: `${name} WH` },
            created.headers
          )
        ).data.stock_location
        await api.post(
          `/vendor/stock-locations/${location.id}/sales-channels`,
          { add: [salesChannel.id] },
          created.headers
        )
        const profile = (
          await api.post(
            `/vendor/shipping-profiles`,
            { name: `${name} Profile`, type: "default" },
            created.headers
          )
        ).data.shipping_profile

        return {
          id,
          headers: created.headers,
          locationId: location.id,
          profileId: profile.id,
        }
      }

      const createOffer = async (
        seller: Seller,
        variant: string,
        amount: number
      ) => {
        const tag = `${++seq}`
        return (
          await api.post(
            `/vendor/offers`,
            {
              sku: `PLSCOPE-${seller.id}-${tag}`,
              variant_id: variant,
              shipping_profile_id: seller.profileId,
              inventory_items: [
                {
                  title: `PL scope inventory ${tag}`,
                  required_quantity: 1,
                  stock_levels: [
                    { location_id: seller.locationId, stocked_quantity: 50 },
                  ],
                },
              ],
              prices: [{ amount, currency_code: "usd" }],
            },
            seller.headers
          )
        ).data.offer
      }

      const createPriceList = async (seller: Seller, prices: any[] = []) =>
        api
          .post(
            `/vendor/price-lists`,
            {
              title: `Sale ${++seq}`,
              description: "price-list offer scope",
              type: "override",
              status: "active",
              prices,
            },
            seller.headers
          )
          .catch((e: { response: any }) => e.response)

      const batch = (seller: Seller, priceListId: string, body: any) =>
        api
          .post(
            `/vendor/price-lists/${priceListId}/prices/batch`,
            body,
            seller.headers
          )
          .catch((e: { response: any }) => e.response)

      const storeOfferPrices = async () => {
        const response = await api.get(
          `/store/offers?variant_id=${variantId}&fields=+calculated_price,+product_variant.price_set.id&region_id=${region.id}`,
          storeHeaders
        )
        expect(response.status).toEqual(200)
        return new Map<string, number>(
          response.data.offers.map((o: any) => [
            o.id,
            o.calculated_price?.calculated_amount,
          ])
        )
      }

      const cartUnitPrices = async () => {
        const cartId = (
          await api.post(
            `/store/carts`,
            {
              region_id: region.id,
              sales_channel_id: salesChannel.id,
              currency_code: "usd",
            },
            storeHeaders
          )
        ).data.cart.id
        for (const offer of [offerA, offerB]) {
          await api.post(
            `/store/carts/${cartId}/line-items`,
            { offer_id: offer.id, quantity: 1 },
            storeHeaders
          )
        }
        const cart = (await api.get(`/store/carts/${cartId}`, storeHeaders)).data
          .cart
        return new Map<string, number>(
          cart.items.map((item: any) => [
            item.metadata?.offer_id,
            Number(item.unit_price),
          ])
        )
      }

      const listRows = async (priceListId: string) => {
        const query = appContainer.resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "price",
          filters: { price_list_id: priceListId },
          fields: [
            "id",
            "amount",
            "price_set_id",
            "price_rules.attribute",
            "price_rules.value",
          ],
        })
        return data as any[]
      }

      const offerRuleOf = (row: any) =>
        (row.price_rules ?? []).find((r: any) => r.attribute === "offer_id")
          ?.value

      const basePriceOf = async (offerId: string) => {
        const query = appContainer.resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "price",
          filters: { price_set_id: priceSetId, price_list_id: null },
          fields: ["id", "amount", "price_rules.attribute", "price_rules.value"],
        })
        return (data as any[]).find((row) => offerRuleOf(row) === offerId)
      }

      beforeAll(async () => {
        appContainer = getContainer()
      })

      beforeEach(async () => {
        const salesChannelModule =
          appContainer.resolve<ISalesChannelModuleService>(Modules.SALES_CHANNEL)
        salesChannel = await salesChannelModule.createSalesChannels({
          name: "PL Scope Store",
        })
        const regionModule = appContainer.resolve<IRegionModuleService>(
          Modules.REGION
        )
        region = await regionModule.createRegions({
          name: "PL Scope Region",
          currency_code: "usd",
          countries: ["us"],
        })
        const apiKey = await generatePublishableKey(appContainer)
        storeHeaders = generateStoreHeaders({ publishableKey: apiKey })
        const link = appContainer.resolve(ContainerRegistrationKeys.LINK)
        await link.create({
          [Modules.API_KEY]: { publishable_key_id: apiKey.id },
          [Modules.SALES_CHANNEL]: { sales_channel_id: salesChannel.id },
        })

        sellerA = await setUpSeller("pl-scope-a@test.com", "Scope A")
        sellerB = await setUpSeller("pl-scope-b@test.com", "Scope B")

        // ONE master product, two producers selling its variant.
        const product = await createVendorProduct(api, sellerA.headers, {
          title: "Shared Master",
          sku: "PL-SCOPE-MASTER",
          status: "published",
        })
        await api.post(
          `/vendor/sales-channels/${salesChannel.id}/products`,
          { add: [product.id] },
          sellerA.headers
        )
        variantId = product.variants[0].id

        offerA = await createOffer(sellerA, variantId, 1000)
        offerB = await createOffer(sellerB, variantId, 2000)

        const query = appContainer.resolve(ContainerRegistrationKeys.QUERY)
        const { data: variants } = await query.graph({
          entity: "product_variant",
          fields: ["price_set.id"],
          filters: { id: variantId },
        })
        priceSetId = (variants[0] as any).price_set.id
      })

      it("pins a batch price without offer_id to the seller's own offer; the other producer keeps its price", async () => {
        const priceListId = (await createPriceList(sellerA)).data.price_list.id

        const response = await batch(sellerA, priceListId, {
          create: [{ variant_id: variantId, currency_code: "usd", amount: 500 }],
        })

        expect(response.status).toEqual(200)

        // What the product page shows and what the cart charges, per offer.
        expect({
          shown: Object.fromEntries(await storeOfferPrices()),
          charged: Object.fromEntries(await cartUnitPrices()),
        }).toEqual({
          shown: { [offerA.id]: 500, [offerB.id]: 2000 },
          charged: { [offerA.id]: 500, [offerB.id]: 2000 },
        })

        const rows = await listRows(priceListId)
        expect(rows).toHaveLength(1)
        expect(offerRuleOf(rows[0])).toEqual(offerA.id)
      })

      it("pins prices sent with the price list itself the same way", async () => {
        const response = await createPriceList(sellerA, [
          { variant_id: variantId, currency_code: "usd", amount: 700 },
        ])

        expect(response.status).toEqual(201)
        expect(Object.fromEntries(await storeOfferPrices())).toEqual({
          [offerA.id]: 700,
          [offerB.id]: 2000,
        })

        const rows = await listRows(response.data.price_list.id)
        expect(rows).toHaveLength(1)
        expect(offerRuleOf(rows[0])).toEqual(offerA.id)
      })

      it("refuses a price that names another producer's offer, and writes nothing", async () => {
        const priceListId = (await createPriceList(sellerA)).data.price_list.id

        const response = await batch(sellerA, priceListId, {
          create: [
            {
              variant_id: variantId,
              currency_code: "usd",
              amount: 1,
              rules: { offer_id: offerB.id },
            },
          ],
        })

        expect(response.status).toEqual(404)
        expect(await listRows(priceListId)).toEqual([])
        expect((await storeOfferPrices()).get(offerB.id)).toEqual(2000)
      })

      it("refuses the same when the price list is created with it", async () => {
        const response = await createPriceList(sellerA, [
          {
            variant_id: variantId,
            currency_code: "usd",
            amount: 1,
            rules: { offer_id: offerB.id },
          },
        ])

        expect(response.status).toEqual(404)
        const { data: lists } = await api.get(
          `/vendor/price-lists`,
          sellerA.headers
        )
        expect(lists.price_lists).toEqual([])
      })

      it("refuses a variant the seller has no offer on", async () => {
        // Seller B's own product, which seller A does not sell.
        const other = await createVendorProduct(api, sellerB.headers, {
          title: "B Only",
          sku: "PL-SCOPE-B-ONLY",
          status: "published",
        })
        await createOffer(sellerB, other.variants[0].id, 3000)
        const priceListId = (await createPriceList(sellerA)).data.price_list.id

        const response = await batch(sellerA, priceListId, {
          create: [
            { variant_id: other.variants[0].id, currency_code: "usd", amount: 1 },
          ],
        })

        expect(response.status).toEqual(400)
        expect(await listRows(priceListId)).toEqual([])
      })

      it("asks which offer when the seller sells the variant twice", async () => {
        const second = await createOffer(sellerA, variantId, 1500)
        const priceListId = (await createPriceList(sellerA)).data.price_list.id

        const ambiguous = await batch(sellerA, priceListId, {
          create: [{ variant_id: variantId, currency_code: "usd", amount: 400 }],
        })
        expect(ambiguous.status).toEqual(400)
        expect(await listRows(priceListId)).toEqual([])

        const named = await batch(sellerA, priceListId, {
          create: [
            {
              variant_id: variantId,
              currency_code: "usd",
              amount: 400,
              rules: { offer_id: second.id },
            },
          ],
        })
        expect(named.status).toEqual(200)
        const rows = await listRows(priceListId)
        expect(rows.map(offerRuleOf)).toEqual([second.id])
      })

      it("refuses an own offer_id that sells a different variant", async () => {
        const otherProduct = await createVendorProduct(api, sellerA.headers, {
          title: "A Second Product",
          sku: "PL-SCOPE-A-2",
          status: "published",
        })
        const elsewhere = await createOffer(
          sellerA,
          otherProduct.variants[0].id,
          900
        )
        const priceListId = (await createPriceList(sellerA)).data.price_list.id

        const response = await batch(sellerA, priceListId, {
          create: [
            {
              variant_id: variantId,
              currency_code: "usd",
              amount: 1,
              rules: { offer_id: elsewhere.id },
            },
          ],
        })

        expect(response.status).toEqual(400)
        expect(await listRows(priceListId)).toEqual([])
      })

      it("cannot update another producer's price through its own list", async () => {
        const priceListId = (await createPriceList(sellerA)).data.price_list.id
        const foreign = await basePriceOf(offerB.id)
        expect(foreign).toBeDefined()

        const response = await batch(sellerA, priceListId, {
          update: [
            {
              id: foreign.id,
              variant_id: variantId,
              currency_code: "usd",
              amount: 1,
            },
          ],
        })

        expect(response.status).toEqual(404)
        expect(await listRows(priceListId)).toEqual([])
        expect((await basePriceOf(offerB.id)).amount).toEqual(2000)
        expect((await storeOfferPrices()).get(offerB.id)).toEqual(2000)
      })

      it("cannot delete another producer's price through its own list", async () => {
        const priceListId = (await createPriceList(sellerA)).data.price_list.id
        const foreign = await basePriceOf(offerB.id)

        const response = await batch(sellerA, priceListId, {
          delete: [foreign.id],
        })

        expect(response.status).toEqual(404)
        expect(await basePriceOf(offerB.id)).toBeDefined()
        expect((await storeOfferPrices()).get(offerB.id)).toEqual(2000)
      })

      it("re-pins an old unscoped row when the seller saves it", async () => {
        const priceListId = (await createPriceList(sellerA)).data.price_list.id
        // The shape older builds left behind: a list price with no rules at
        // all. Written through the pricing module because no route can create
        // it any more.
        const pricingModule = appContainer.resolve<IPricingModuleService>(
          Modules.PRICING
        )
        const [legacy] = await pricingModule.addPriceListPrices([
          {
            price_list_id: priceListId,
            prices: [
              { price_set_id: priceSetId, currency_code: "usd", amount: 600 },
            ],
          },
        ])
        expect((await storeOfferPrices()).get(offerB.id)).toEqual(600)

        const response = await batch(sellerA, priceListId, {
          update: [
            {
              id: legacy.id,
              variant_id: variantId,
              currency_code: "usd",
              amount: 650,
            },
          ],
        })

        expect(response.status).toEqual(200)
        const rows = await listRows(priceListId)
        expect(rows).toHaveLength(1)
        expect(offerRuleOf(rows[0])).toEqual(offerA.id)
        const shown = await storeOfferPrices()
        expect(shown.get(offerA.id)).toEqual(650)
        expect(shown.get(offerB.id)).toEqual(2000)
      })

      it("keeps a seller's other rules when it re-pins an edited row", async () => {
        const priceListId = (
          await createPriceList(sellerA, [
            {
              variant_id: variantId,
              currency_code: "usd",
              amount: 800,
              rules: { offer_id: offerA.id, region_id: region.id },
            },
          ])
        ).data.price_list.id
        const [row] = await listRows(priceListId)

        const response = await batch(sellerA, priceListId, {
          update: [
            {
              id: row.id,
              variant_id: variantId,
              currency_code: "usd",
              amount: 750,
            },
          ],
        })

        expect(response.status).toEqual(200)
        const [after] = await listRows(priceListId)
        expect(after.amount).toEqual(750)
        expect(
          Object.fromEntries(
            after.price_rules.map((r: any) => [r.attribute, r.value])
          )
        ).toEqual({ offer_id: offerA.id, region_id: region.id })
      })
    })
  },
})
