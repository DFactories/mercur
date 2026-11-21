import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { MercurModules } from "@mercurjs/types"
import { adminHeaders, createAdminUser } from "../../helpers/create-admin-user"
import { createVendorProduct } from "../../helpers/create-product"
import { createSellerUser } from "../../helpers/create-seller-user"

/**
 * A list search finds the same rows whichever keyboard typed it.
 *
 * Names keep what was typed and `q` is SQL `ILIKE`, which folds neither
 * ي/ی and ك/ک nor Persian and Latin digits. An Arabic keyboard (the default
 * on many phones) types ي and ك, so «كياني» did not find the customer
 * «کیانی», and «۱۰۵» did not find the offer whose SKU ends in 105. The product
 * lists were fixed first; these are the store, customer, order and offer
 * lists of both panels.
 */

jest.setTimeout(120000)

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("List search in either spelling", () => {
      let appContainer: MedusaContainer
      let seller: { id: string; headers: any }

      // Typed on a Persian keyboard, and the same words from an Arabic one.
      const STORE = "کیسه یکتا"
      const STORE_ARABIC = "كيسه يكتا"

      const idsOf = async (url: string, key: string, headers: unknown) =>
        ((await api.get(url, headers)).data[key] as { id: string }[]).map(
          (row) => row.id
        )

      const q = (text: string) => `q=${encodeURIComponent(text)}`

      beforeEach(async () => {
        appContainer = getContainer()
        await createAdminUser(dbConnection, adminHeaders, appContainer)
        const created = await createSellerUser(appContainer, {
          email: "spelling@test.com",
          name: STORE,
        })
        seller = {
          id: (created.seller as { id: string }).id,
          headers: created.headers,
        }
      })

      it("admin store list", async () => {
        expect(
          await idsOf(`/admin/sellers?${q(STORE)}`, "sellers", adminHeaders)
        ).toEqual([seller.id])
        expect(
          await idsOf(`/admin/sellers?${q(STORE_ARABIC)}`, "sellers", adminHeaders)
        ).toEqual([seller.id])
        expect(
          await idsOf(`/admin/sellers?${q("هیچ‌کس")}`, "sellers", adminHeaders)
        ).toEqual([])
      })

      it("customer lists of both panels", async () => {
        const customer = await appContainer
          .resolve(Modules.CUSTOMER)
          .createCustomers({
            first_name: "کریم",
            last_name: "کیانی",
            email: "kiani@test.com",
            phone: "+989121110105",
          })
        await appContainer.resolve(ContainerRegistrationKeys.LINK).create({
          [MercurModules.SELLER]: { seller_id: seller.id },
          [Modules.CUSTOMER]: { customer_id: customer.id },
        })

        for (const text of ["کیانی", "كياني", "۰۱۰۵"]) {
          expect(
            await idsOf(`/admin/customers?${q(text)}`, "customers", adminHeaders)
          ).toEqual([customer.id])
          expect(
            await idsOf(`/vendor/customers?${q(text)}`, "customers", seller.headers)
          ).toEqual([customer.id])
        }
      })

      it("order lists of both panels", async () => {
        const order = await appContainer.resolve(Modules.ORDER).createOrders({
          currency_code: "usd",
          email: "kiani@test.com",
          shipping_address: { first_name: "کریم", city: "کرمان" },
        })
        await appContainer.resolve(ContainerRegistrationKeys.LINK).create({
          [Modules.ORDER]: { order_id: order.id },
          [MercurModules.SELLER]: { seller_id: seller.id },
        })

        for (const text of ["کرمان", "كرمان"]) {
          expect(
            await idsOf(`/admin/orders?${q(text)}`, "orders", adminHeaders)
          ).toEqual([order.id])
          expect(
            await idsOf(`/vendor/orders?${q(text)}`, "orders", seller.headers)
          ).toEqual([order.id])
        }
      })

      it("offer lists of both panels", async () => {
        const location = (
          await api.post(`/vendor/stock-locations`, { name: "WH" }, seller.headers)
        ).data.stock_location
        const profile = (
          await api.post(
            `/vendor/shipping-profiles`,
            { name: "Profile", type: "default" },
            seller.headers
          )
        ).data.shipping_profile
        const product = await createVendorProduct(api, seller.headers, {
          title: "کیسه زباله",
          sku: "BAG-1",
        })
        const offer = (
          await api.post(
            `/vendor/offers`,
            {
              sku: "OFR-105",
              variant_id: product.variants[0].id,
              shipping_profile_id: profile.id,
              inventory_items: [
                {
                  title: "Inventory",
                  stock_levels: [
                    { location_id: location.id, stocked_quantity: 5 },
                  ],
                },
              ],
              prices: [{ amount: 1000, currency_code: "usd" }],
            },
            seller.headers
          )
        ).data.offer as { id: string }

        // The SKU, typed with Persian digits.
        for (const text of ["105", "۱۰۵"]) {
          expect(
            await idsOf(`/vendor/offers?${q(text)}`, "offers", seller.headers)
          ).toEqual([offer.id])
          expect(
            await idsOf(`/admin/offers?${q(text)}`, "offers", adminHeaders)
          ).toEqual([offer.id])
        }

        // The admin list groups by store and searches the product's title.
        for (const text of ["کیسه", "كيسه"]) {
          expect(
            await idsOf(
              `/admin/offers?group_by_seller=true&${q(text)}`,
              "offers",
              adminHeaders
            )
          ).toEqual([offer.id])
        }
      })
    })
  },
})
