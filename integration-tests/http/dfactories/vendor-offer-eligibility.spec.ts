import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  adminHeaders,
  createAdminUser,
} from "../../helpers/create-admin-user"
import { createSellerUser } from "../../helpers/create-seller-user"
import { createVendorProduct } from "../../helpers/create-product"

/**
 * REGRESSION — a seller may only open an offer on a product it could see.
 *
 * `product_seller` is the selling allowlist: a product assigned to sellers is
 * "visible and sellable only for those sellers". Up to core
 * `2.3.1-dfactories.30` only the LIST honoured it — `GET /vendor/products`
 * hid a restricted product from everyone else, but `POST /vendor/offers` and
 * `POST /vendor/offers/batch` accepted any `variant_id`. Any store could post
 * an offer onto a product restricted to another store, or onto another
 * store's unpublished draft, and `/store/offers` (which checks only that the
 * product is published) would sell it on the restricted product's page.
 *
 * The rule offers now follow is exactly the list's rule: the seller's own
 * products whatever their status, plus every published product that is not
 * restricted to other sellers.
 */

jest.setTimeout(120000)

type Seller = { id: string; headers: any; locationId: string; profileId: string }

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("Vendor - offer eligibility", () => {
      let appContainer: MedusaContainer
      let owner: Seller
      let other: Seller
      let seq = 0

      const setUpSeller = async (email: string, name: string): Promise<Seller> => {
        const created = await createSellerUser(appContainer, { email, name })
        const headers = created.headers

        const location = (
          await api.post(`/vendor/stock-locations`, { name: `${name} WH` }, headers)
        ).data.stock_location
        const profile = (
          await api.post(
            `/vendor/shipping-profiles`,
            { name: `${name} Profile`, type: "default" },
            headers
          )
        ).data.shipping_profile

        return {
          id: (created.seller as { id: string }).id,
          headers,
          locationId: location.id,
          profileId: profile.id,
        }
      }

      const offerBody = (seller: Seller, variantId: string) => {
        const tag = `${++seq}`
        return {
          sku: `ELIG-${seller.id}-${tag}`,
          variant_id: variantId,
          shipping_profile_id: seller.profileId,
          inventory_items: [
            {
              title: `Inventory ${tag}`,
              stock_levels: [
                { location_id: seller.locationId, stocked_quantity: 5 },
              ],
            },
          ],
          prices: [{ amount: 1000, currency_code: "usd" }],
        }
      }

      const createOffer = (seller: Seller, variantId: string) =>
        api
          .post(`/vendor/offers`, offerBody(seller, variantId), seller.headers)
          .catch((e: { response: any }) => e.response)

      const createOffersBatch = (seller: Seller, variantIds: string[]) =>
        api
          .post(
            `/vendor/offers/batch`,
            { offers: variantIds.map((id) => offerBody(seller, id)) },
            seller.headers
          )
          .catch((e: { response: any }) => e.response)

      const offersOf = async (sellerId: string) => {
        const query = appContainer.resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "offer",
          fields: ["id", "product_id"],
          filters: { seller_id: sellerId },
        })
        return data as { id: string; product_id: string }[]
      }

      const restrictTo = (productId: string, sellerIds: string[]) =>
        api.post(
          `/admin/products/${productId}/sellers`,
          { add: sellerIds, remove: [] },
          adminHeaders
        )

      beforeEach(async () => {
        appContainer = getContainer()
        await createAdminUser(dbConnection, adminHeaders, appContainer)
        owner = await setUpSeller("owner@test.com", "Owner Store")
        other = await setUpSeller("other@test.com", "Other Store")
      })

      it("lets another seller offer on a published shared product", async () => {
        const product = await createVendorProduct(api, owner.headers, {
          title: "Shared Product",
          status: "published",
        })

        const response = await createOffer(other, product.variants[0].id)

        expect(response.status).toEqual(201)
        expect(response.data.offer.product_id).toEqual(product.id)
      })

      it("refuses an offer on a product restricted to other sellers", async () => {
        const product = await createVendorProduct(api, owner.headers, {
          title: "Restricted Product",
          status: "published",
        })
        await restrictTo(product.id, [owner.id])

        const response = await createOffer(other, product.variants[0].id)

        expect(response.status).toEqual(404)
        expect(await offersOf(other.id)).toEqual([])
      })

      it("refuses the same through the batch route, and writes nothing", async () => {
        const open = await createVendorProduct(api, owner.headers, {
          title: "Open Product",
          status: "published",
        })
        const restricted = await createVendorProduct(api, owner.headers, {
          title: "Restricted Product",
          status: "published",
        })
        await restrictTo(restricted.id, [owner.id])

        const response = await createOffersBatch(other, [
          open.variants[0].id,
          restricted.variants[0].id,
        ])

        expect(response.status).toEqual(404)
        expect(await offersOf(other.id)).toEqual([])
      })

      it("refuses an offer on another store's unpublished product", async () => {
        const draft = await createVendorProduct(api, owner.headers, {
          title: "Owner Draft",
          status: "draft",
        })

        const response = await createOffer(other, draft.variants[0].id)

        expect(response.status).toEqual(404)
        expect(await offersOf(other.id)).toEqual([])
      })

      it("still lets a seller offer on its own unpublished product", async () => {
        const draft = await createVendorProduct(api, owner.headers, {
          title: "Own Draft",
          status: "draft",
        })

        const response = await createOffer(owner, draft.variants[0].id)

        expect(response.status).toEqual(201)
      })

      it("lets a seller the product is assigned to offer on it", async () => {
        const product = await createVendorProduct(api, owner.headers, {
          title: "Assigned Product",
          status: "published",
        })
        await restrictTo(product.id, [owner.id, other.id])

        const response = await createOffer(other, product.variants[0].id)

        expect(response.status).toEqual(201)
      })

      it("answers 404 for a variant that does not exist", async () => {
        const response = await createOffer(other, "variant_does_not_exist")

        expect(response.status).toEqual(404)
      })
    })
  },
})
