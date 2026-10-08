process.env.MEDUSA_FF_PRODUCT_REQUEST = "true"

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
 * REGRESSION — one store's edit must not take another store's offers with it.
 *
 * Production, 2026-10-08: a store that had not even been approved asked to
 * remove every variant of a master product it shared with another producer,
 * the operator approved, and the other producer's eight offers were left on
 * deleted variants. Deleting a variant soft-deletes its price set, so those
 * offers lost their prices and the product dropped off the storefront, while
 * the offer rows themselves stayed — invisible in the panel and still holding
 * their SKUs.
 *
 * A variant or a product another store sells on cannot be removed — not by a
 * store's request, not when the operator approves one, and not by the
 * operator's own variant delete. A store removing a variant it alone sells on
 * takes its own offers with it.
 */

jest.setTimeout(120000)

type Seller = {
  id: string
  name: string
  headers: any
  locationId: string
  profileId: string
}

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("Removing an offered variant of a shared product", () => {
      let container: MedusaContainer
      let maker: Seller
      let rival: Seller
      let seq = 0

      const setUpSeller = async (email: string, name: string): Promise<Seller> => {
        const created = await createSellerUser(container, { email, name })
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
          name,
          headers,
          locationId: location.id,
          profileId: profile.id,
        }
      }

      const createSharedProduct = async () => {
        const product = await createVendorProduct(api, maker.headers, {
          title: `Shared tray ${++seq}`,
          status: "proposed",
          attributes: [
            { title: "Thickness", values: ["45", "50"], is_variant_axis: true },
          ],
          variants: [
            { title: "45", options: { Thickness: "45" } },
            { title: "50", options: { Thickness: "50" } },
          ],
        })
        await api.post(`/admin/products/${product.id}/confirm`, {}, adminHeaders)
        const variantId = (title: string) =>
          (product.variants as { id: string; title?: string }[]).find(
            (v) => v.title === title
          )!.id
        return { id: product.id, v45: variantId("45"), v50: variantId("50") }
      }

      const offer = async (seller: Seller, variantId: string) =>
        (
          await api.post(
            `/vendor/offers`,
            {
              sku: `RM-${seller.id}-${++seq}`,
              variant_id: variantId,
              shipping_profile_id: seller.profileId,
              inventory_items: [
                {
                  title: `Stock ${seq}`,
                  stock_levels: [
                    { location_id: seller.locationId, stocked_quantity: 5 },
                  ],
                },
              ],
              prices: [{ amount: 1000, currency_code: "usd" }],
            },
            seller.headers
          )
        ).data.offer as { id: string }

      const liveVariantIds = async (productId: string) => {
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "variant",
          fields: ["id"],
          filters: { product_id: productId },
        })
        return (data as { id: string }[]).map((v) => v.id).sort()
      }

      const liveOfferIds = async (sellerId: string) => {
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "offer",
          fields: ["id"],
          filters: { seller_id: sellerId },
        })
        return (data as { id: string }[]).map((o) => o.id).sort()
      }

      const removeVariant = (seller: Seller, productId: string, variantId: string) =>
        api
          .delete(`/vendor/products/${productId}/variants/${variantId}`, seller.headers)
          .catch((e: { response: any }) => e.response)

      const confirmChange = (changeId: string) =>
        api
          .post(`/admin/product-changes/${changeId}/confirm`, {}, adminHeaders)
          .catch((e: { response: any }) => e.response)

      beforeAll(() => {
        container = getContainer()
      })

      beforeEach(async () => {
        await createAdminUser(dbConnection, adminHeaders, container)
        maker = await setUpSeller("maker@test.com", "Maker Store")
        rival = await setUpSeller("rival@test.com", "Rival Store")
      })

      it("refuses a store's request to remove a variant another store sells", async () => {
        const product = await createSharedProduct()
        const rivalOffer = await offer(rival, product.v45)

        const response = await removeVariant(maker, product.id, product.v45)

        expect(response.status).toEqual(400)
        expect(response.data.message).toEqual(
          'Variant "45" is on sale by Rival Store'
        )
        expect(await liveVariantIds(product.id)).toEqual(
          [product.v45, product.v50].sort()
        )
        expect(await liveOfferIds(rival.id)).toEqual([rivalOffer.id])
      })

      it("refuses the approval when an offer arrived after the request", async () => {
        const product = await createSharedProduct()
        const staged = await removeVariant(maker, product.id, product.v50)
        expect(staged.status).toEqual(202)

        const rivalOffer = await offer(rival, product.v50)
        const response = await confirmChange(staged.data.product_change.id)

        expect(response.status).toEqual(400)
        expect(response.data.message).toEqual(
          'Variant "50" is on sale by Rival Store'
        )
        expect(await liveVariantIds(product.id)).toContain(product.v50)
        expect(await liveOfferIds(rival.id)).toEqual([rivalOffer.id])
      })

      it("lets a store remove a variant only it sells, closing its own offer", async () => {
        const product = await createSharedProduct()
        const ownOffer = await offer(maker, product.v50)
        const rivalOffer = await offer(rival, product.v45)

        const staged = await removeVariant(maker, product.id, product.v50)
        expect(staged.status).toEqual(202)
        const response = await confirmChange(staged.data.product_change.id)

        expect(response.status).toEqual(200)
        expect(await liveVariantIds(product.id)).toEqual([product.v45])
        expect(await liveOfferIds(maker.id)).not.toContain(ownOffer.id)
        expect(await liveOfferIds(rival.id)).toEqual([rivalOffer.id])
      })

      it("refuses the operator's own delete of a variant a store sells", async () => {
        const product = await createSharedProduct()
        await offer(rival, product.v45)

        const response = await api
          .delete(
            `/admin/products/${product.id}/variants/${product.v45}`,
            adminHeaders
          )
          .catch((e: { response: any }) => e.response)

        expect(response.status).toEqual(400)
        expect(response.data.message).toEqual(
          'Variant "45" is on sale by Rival Store'
        )
        expect(await liveVariantIds(product.id)).toContain(product.v45)
      })

      it("refuses a store's request to delete a product another store sells", async () => {
        const product = await createSharedProduct()
        await offer(rival, product.v45)

        const response = await api
          .delete(`/vendor/products/${product.id}`, maker.headers)
          .catch((e: { response: any }) => e.response)

        expect(response.status).toEqual(400)
        expect(response.data.message).toEqual("Product is on sale by Rival Store")
        expect(await liveVariantIds(product.id)).toHaveLength(2)
      })

      it("filters a store's offers by product", async () => {
        const product = await createSharedProduct()
        const ownOffer = await offer(maker, product.v50)

        const response = await api.get(
          `/vendor/offers?product_id=${product.id}&fields=id,variant_id`,
          maker.headers
        )

        expect(response.status).toEqual(200)
        expect(response.data.offers).toEqual([
          expect.objectContaining({ id: ownOffer.id, variant_id: product.v50 }),
        ])
      })
    })
  },
})
