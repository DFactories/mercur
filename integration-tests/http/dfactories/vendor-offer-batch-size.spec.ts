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
 * REGRESSION — a store can save more than 100 offers in one go.
 *
 * On 2026-10-14 a producer priced a whole catalogue in «ایجاد پیشنهاد», ticked
 * more than 100 rows and pressed «ثبت» three times. Every attempt answered 400
 * `Value for field 'offers' too big, expected at most: '100'` and nothing was
 * saved; the form sends every ticked row in one `POST /vendor/offers/batch`.
 *
 * Two limits sat in the way: the row cap (100) and the JSON body size (the
 * 100 KB default, about 150 rows of what the form sends). Up to core
 * `2.3.1-dfactories.37` the first refused this batch, and the second would
 * have refused a slightly larger one with a 413.
 */

jest.setTimeout(300000)

const ROWS = 150

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("Vendor - offer batch size", () => {
      let appContainer: MedusaContainer
      let headers: any
      let sellerId: string
      let locationId: string
      let profileId: string

      const row = (variantId: string, i: number) => ({
        sku: `BATCH-${String(i).padStart(4, "0")}`,
        variant_id: variantId,
        shipping_profile_id: profileId,
        inventory_items: [
          {
            title: "ظرف یکبار مصرف آلومینیومی دو پرس درب دار",
            stock_levels: [{ location_id: locationId, stocked_quantity: 1000 }],
          },
        ],
        prices: [{ amount: 55_000_000, currency_code: "usd" }],
      })

      const postBatch = (offers: unknown[]) =>
        api
          .post(`/vendor/offers/batch`, { offers }, headers)
          .catch((e: { response: any }) => e.response)

      beforeEach(async () => {
        appContainer = getContainer()
        await createAdminUser(dbConnection, adminHeaders, appContainer)
        const created = await createSellerUser(appContainer, {
          email: "batch@test.com",
          name: "Batch Store",
        })
        headers = created.headers
        sellerId = (created.seller as { id: string }).id

        locationId = (
          await api.post(`/vendor/stock-locations`, { name: "Batch WH" }, headers)
        ).data.stock_location.id
        profileId = (
          await api.post(
            `/vendor/shipping-profiles`,
            { name: "Batch Profile", type: "default" },
            headers
          )
        ).data.shipping_profile.id
      })

      it(`creates ${ROWS} offers in one batch`, async () => {
        const sizes = Array.from({ length: ROWS }, (_, i) => `S${i + 1}`)
        const product = await createVendorProduct(api, headers, {
          title: "Big Catalogue",
          status: "published",
          attributes: [
            {
              title: "Size",
              type: "multi_select",
              values: sizes,
              is_variant_axis: true,
            },
          ],
          variants: sizes.map((size) => ({
            title: size,
            options: { Size: size },
          })),
        })
        expect(product.variants).toHaveLength(ROWS)

        const response = await postBatch(
          product.variants.map((v, i) => row(v.id, i))
        )

        expect(response.status).toEqual(201)
        expect(response.data.offers).toHaveLength(ROWS)

        const query = appContainer.resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "offer",
          fields: ["id"],
          filters: { seller_id: sellerId },
        })
        expect(data).toHaveLength(ROWS)
      })

      it("reads a batch body larger than 100 KB", async () => {
        // Variants that do not exist: the request is refused by the ownership
        // check (404), which only runs AFTER the body was parsed and validated.
        // A body-size refusal would be 413, a row-cap refusal 400.
        const offers = Array.from({ length: 400 }, (_, i) =>
          row(`variant_does_not_exist_${i}`, i)
        )
        expect(Buffer.byteLength(JSON.stringify({ offers }))).toBeGreaterThan(
          100 * 1024
        )

        const response = await postBatch(offers)

        expect(response.status).toEqual(404)
      })
    })
  },
})
