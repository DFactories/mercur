import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"

import {
    createAdminUser,
    adminHeaders,
    generatePublishableKey,
    generateStoreHeaders,
} from "../../helpers/create-admin-user"
import { seedSellerOfferWithShipping } from "../../helpers/split-order-checkout"

jest.setTimeout(120000)

/**
 * Until core .43 a vendor could create a shipping option on another vendor's
 * service zone. Such a row is still there, and the checkout listed it: a cart
 * holding only seller A's goods was offered seller B's option, under B's name,
 * because the listing takes every option of the fulfillment sets of A's
 * warehouses and groups them by the seller each is linked to.
 */
medusaIntegrationTestRunner({
    testSuite: ({ getContainer, api, dbConnection }) => {
        it("lists shipping options only for the sellers whose goods are in the cart", async () => {
            const container = getContainer()
            await createAdminUser(dbConnection, adminHeaders, container)
            const storeHeaders = generateStoreHeaders({
                publishableKey: await generatePublishableKey(container),
            })
            const salesChannel = await container
                .resolve(Modules.SALES_CHANNEL)
                .createSalesChannels({ name: "Own Seller Channel" })
            const region = await container.resolve(Modules.REGION).createRegions({
                name: "Own Seller Region",
                currency_code: "usd",
                countries: ["us"],
            })

            const seed = (name: string) =>
                seedSellerOfferWithShipping({
                    container,
                    api,
                    salesChannelId: salesChannel.id,
                    email: `${name.toLowerCase()}@test.com`,
                    name,
                    stocked: 20,
                    offerPrice: 2500,
                })
            const a = await seed("OwnSellerA")
            const b = await seed("OwnSellerB")
            const optionOf = async (seller: typeof a) =>
                (await api.get(`/vendor/shipping-options`, seller.headers)).data
                    .shipping_options[0]

            // The legacy row: B's option, standing on A's service zone. The
            // route refuses to create one now, so it is moved there.
            const foreign = await optionOf(b)
            await container.resolve(Modules.FULFILLMENT).updateShippingOptions(
                foreign.id,
                { service_zone_id: (await optionOf(a)).service_zone_id }
            )

            const cart = (
                await api.post(
                    `/store/carts`,
                    {
                        region_id: region.id,
                        sales_channel_id: salesChannel.id,
                        currency_code: "usd",
                    },
                    storeHeaders
                )
            ).data.cart
            await api.post(
                `/store/carts/${cart.id}/line-items`,
                { offer_id: a.offer.id, quantity: 1 },
                storeHeaders
            )
            const address = {
                first_name: "Buyer",
                last_name: "Test",
                address_1: "123 Main St",
                city: "New York",
                country_code: "us",
                postal_code: "10001",
            }
            await api.post(
                `/store/carts/${cart.id}`,
                { shipping_address: address, billing_address: address },
                storeHeaders
            )

            const { data } = await api.get(
                `/store/shipping-options?cart_id=${cart.id}`,
                storeHeaders
            )

            expect(Object.keys(data.shipping_options)).toEqual([a.sellerId])
        })
    },
})
