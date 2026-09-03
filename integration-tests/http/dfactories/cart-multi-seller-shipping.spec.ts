import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
    IRegionModuleService,
    ISalesChannelModuleService,
    MedusaContainer,
} from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { MercurModules, SellerStatus } from "@mercurjs/types"
import { createSellerUser } from "../../helpers/create-seller-user"
import { createCustomerUser } from "../../helpers/create-customer-user"
import {
    generatePublishableKey,
    generateStoreHeaders,
} from "../../helpers/create-admin-user"
import { createVendorProduct } from "../../helpers/create-product"

/**
 * REGRESSION — a second producer's carriage must never take the first one's
 * with it.
 *
 * Production incident (2026-09-02, cart `cart_01M1H8GK26WK2RREATG2PJTVYK`):
 * «باربری» was added at 18:30:05 and survived alone. «ترابرنت» was added at
 * 18:30:07.931. At 18:30:08.075 BOTH rows were soft-deleted in the same
 * refresh, 144ms later, and the buyer was left with no carriage at all and
 * nothing said. A two-producer basket simply could not hold two freights.
 *
 * The mechanism is Medusa's, not this fork's. `refreshCartShippingMethodsWorkflow`
 * — which `refreshCartItemsWorkflow` runs on EVERY cart mutation — drops a
 * shipping method whose option sits on a shipping profile no cart item
 * requires, gated on `shippingMethods.length > 1`. In single-vendor Medusa that
 * is correct. In a marketplace that gate means "more than one seller is
 * shipping", because Mercur lists options per SELLER and never consults the
 * profile — so the rule fires exactly when a marketplace cart becomes real.
 *
 * On production every seller shipping option sat on a profile that carried no
 * goods at all, so no option was ever "required" and both were culled.
 *
 * The fork cannot neutralise the cull (a Medusa workflow cannot be
 * re-registered with a different step definition, and the cull is reached from
 * every cart path, not just this one). So it does the next thing that makes the
 * failure impossible to miss: it REFUSES an option the cart is about to lose,
 * before anything is written. The contract these tests pin is therefore:
 *
 *   - a well-formed two-producer cart keeps BOTH carriages;
 *   - a mismatched option is refused outright, and the carriage already chosen
 *     is still there afterwards.
 *
 * Never the third outcome, which is what shipped: accepted, then silently
 * deleted along with its neighbour.
 */

jest.setTimeout(180000)

medusaIntegrationTestRunner({
    testSuite: ({ getContainer, api }) => {
        describe("Store - two producers, two carriages", () => {
            let appContainer: MedusaContainer
            let seller1: any
            let seller1Headers: any
            let seller2: any
            let seller2Headers: any
            let storeHeaders: any
            let region: any
            let salesChannel: any
            let offer1: any
            let offer2: any
            let option1: any
            let option2: any
            /** Seller 2's carriage on a profile NO cart item requires. */
            let orphanOption: any

            let prerequisiteCounter = 0

            const approveSeller = async (sellerId: string) => {
                const sellerModule: any = appContainer.resolve(MercurModules.SELLER)
                await sellerModule.updateSellers({
                    id: sellerId,
                    status: SellerStatus.OPEN,
                })
            }

            const createShippingPrerequisites = async (
                headers: any,
                prefix: string
            ) => {
                const suffix = `_${prefix}_${Date.now()}_${++prerequisiteCounter}`

                const locationResponse = await api.post(
                    `/vendor/stock-locations`,
                    { name: `Warehouse${suffix}` },
                    headers
                )
                const stockLocation = locationResponse.data.stock_location

                await api.post(
                    `/vendor/stock-locations/${stockLocation.id}/fulfillment-sets`,
                    { name: `Fulfillment Set${suffix}`, type: "shipping" },
                    headers
                )

                const updatedLocation = await api.get(
                    `/vendor/stock-locations/${stockLocation.id}?fields=*fulfillment_sets`,
                    headers
                )
                const fulfillmentSet =
                    updatedLocation.data.stock_location.fulfillment_sets[0]

                const serviceZoneResponse = await api.post(
                    `/vendor/fulfillment-sets/${fulfillmentSet.id}/service-zones`,
                    {
                        name: `Service Zone${suffix}`,
                        geo_zones: [{ type: "country", country_code: "us" }],
                    },
                    headers
                )
                const serviceZone =
                    serviceZoneResponse.data.fulfillment_set.service_zones.find(
                        (z: any) => z.name === `Service Zone${suffix}`
                    )

                const shippingProfileResponse = await api.post(
                    `/vendor/shipping-profiles`,
                    { name: `Shipping Profile${suffix}`, type: "default" },
                    headers
                )
                const shippingProfile =
                    shippingProfileResponse.data.shipping_profile

                await api.post(
                    `/vendor/stock-locations/${stockLocation.id}/fulfillment-providers`,
                    { add: ["manual_manual"] },
                    headers
                )

                await api.post(
                    `/vendor/stock-locations/${stockLocation.id}/sales-channels`,
                    { add: [salesChannel.id] },
                    headers
                )

                return { stockLocation, fulfillmentSet, serviceZone, shippingProfile }
            }

            const createShippingOption = async (
                headers: any,
                args: {
                    name: string
                    serviceZoneId: string
                    shippingProfileId: string
                    amount: number
                }
            ) => {
                const response = await api.post(
                    `/vendor/shipping-options`,
                    {
                        name: args.name,
                        service_zone_id: args.serviceZoneId,
                        shipping_profile_id: args.shippingProfileId,
                        provider_id: "manual_manual",
                        price_type: "flat",
                        type: {
                            label: "Standard",
                            description: "Standard shipping",
                            code: "standard",
                        },
                        prices: [{ currency_code: "usd", amount: args.amount }],
                        rules: [
                            {
                                attribute: "enabled_in_store",
                                value: "true",
                                operator: "eq",
                            },
                        ],
                    },
                    headers
                )
                return response.data.shipping_option
            }

            beforeAll(async () => {
                appContainer = getContainer()
            })

            // ONE beforeEach, deliberately. A nested `beforeAll` fixture is
            // rolled back to the top-level snapshot after the first test in this
            // runner, so a second test would run against a seller that no longer
            // exists — and the failure looks nothing like the cause.
            beforeEach(async () => {
                const seller1Result = await createSellerUser(appContainer, {
                    email: "carriage-seller1@test.com",
                    name: "Carriage Seller 1",
                })
                seller1 = seller1Result.seller
                seller1Headers = seller1Result.headers

                const seller2Result = await createSellerUser(appContainer, {
                    email: "carriage-seller2@test.com",
                    name: "Carriage Seller 2",
                })
                seller2 = seller2Result.seller
                seller2Headers = seller2Result.headers

                await approveSeller(seller1.id)
                await approveSeller(seller2.id)

                const customerResult = await createCustomerUser(appContainer, {
                    email: "carriage-customer@test.com",
                    first_name: "Carriage",
                    last_name: "Customer",
                })

                const apiKey = await generatePublishableKey(appContainer)
                const baseStoreHeaders = generateStoreHeaders({
                    publishableKey: apiKey,
                })
                storeHeaders = {
                    headers: {
                        ...baseStoreHeaders.headers,
                        ...customerResult.headers.headers,
                    },
                }

                const salesChannelModule =
                    appContainer.resolve<ISalesChannelModuleService>(
                        Modules.SALES_CHANNEL
                    )
                salesChannel = await salesChannelModule.createSalesChannels({
                    name: "Carriage Store",
                })

                const regionModule = appContainer.resolve<IRegionModuleService>(
                    Modules.REGION
                )
                region = await regionModule.createRegions({
                    name: "Carriage Region",
                    currency_code: "usd",
                    countries: ["us"],
                })

                const link = appContainer.resolve(ContainerRegistrationKeys.LINK)
                await link.create({
                    [Modules.REGION]: { region_id: region.id },
                    [Modules.PAYMENT]: { payment_provider_id: "pp_system_default" },
                })

                const product1 = await createVendorProduct(api, seller1Headers, {
                    title: "Carriage Seller 1 Product",
                    sku: "CARRIAGE-S1",
                    variantTitle: "Small",
                })
                await api.post(
                    `/vendor/sales-channels/${salesChannel.id}/products`,
                    { add: [product1.id] },
                    seller1Headers
                )

                const product2 = await createVendorProduct(api, seller2Headers, {
                    title: "Carriage Seller 2 Product",
                    sku: "CARRIAGE-S2",
                    variantTitle: "Red",
                })
                await api.post(
                    `/vendor/sales-channels/${salesChannel.id}/products`,
                    { add: [product2.id] },
                    seller2Headers
                )

                const prereq1 = await createShippingPrerequisites(
                    seller1Headers,
                    "carriage1"
                )
                const prereq2 = await createShippingPrerequisites(
                    seller2Headers,
                    "carriage2"
                )

                option1 = await createShippingOption(seller1Headers, {
                    name: "Seller 1 Carriage",
                    serviceZoneId: prereq1.serviceZone.id,
                    shippingProfileId: prereq1.shippingProfile.id,
                    amount: 500,
                })
                option2 = await createShippingOption(seller2Headers, {
                    name: "Seller 2 Carriage",
                    serviceZoneId: prereq2.serviceZone.id,
                    shippingProfileId: prereq2.shippingProfile.id,
                    amount: 600,
                })

                // THE PRODUCTION SHAPE. A second profile of seller 2's that no
                // offer uses, with a carriage on it — on production every seller
                // option lived on exactly such a profile («مرسولات سنگین/حجیم»,
                // twelve options, zero products).
                const orphanProfileResponse = await api.post(
                    `/vendor/shipping-profiles`,
                    {
                        name: `Orphan Profile_${Date.now()}`,
                        type: "orphan",
                    },
                    seller2Headers
                )
                orphanOption = await createShippingOption(seller2Headers, {
                    name: "Seller 2 Orphan Carriage",
                    serviceZoneId: prereq2.serviceZone.id,
                    shippingProfileId:
                        orphanProfileResponse.data.shipping_profile.id,
                    amount: 700,
                })

                const offer1Response = await api.post(
                    `/vendor/offers`,
                    {
                        sku: `OF-CARRIAGE1-${Date.now()}`,
                        variant_id: product1.variants[0].id,
                        shipping_profile_id: prereq1.shippingProfile.id,
                        inventory_items: [
                            {
                                title: "Carriage Seller 1 Inventory",
                                required_quantity: 1,
                                stock_levels: [
                                    {
                                        location_id: prereq1.stockLocation.id,
                                        stocked_quantity: 100,
                                    },
                                ],
                            },
                        ],
                        prices: [{ currency_code: "usd", amount: 1000 }],
                    },
                    seller1Headers
                )
                offer1 = offer1Response.data.offer

                const offer2Response = await api.post(
                    `/vendor/offers`,
                    {
                        sku: `OF-CARRIAGE2-${Date.now()}`,
                        variant_id: product2.variants[0].id,
                        shipping_profile_id: prereq2.shippingProfile.id,
                        inventory_items: [
                            {
                                title: "Carriage Seller 2 Inventory",
                                required_quantity: 1,
                                stock_levels: [
                                    {
                                        location_id: prereq2.stockLocation.id,
                                        stocked_quantity: 100,
                                    },
                                ],
                            },
                        ],
                        prices: [{ currency_code: "usd", amount: 2000 }],
                    },
                    seller2Headers
                )
                offer2 = offer2Response.data.offer
            })

            const twoProducerCart = async () => {
                const cartResponse = await api.post(
                    `/store/carts`,
                    {
                        region_id: region.id,
                        sales_channel_id: salesChannel.id,
                        currency_code: "usd",
                    },
                    storeHeaders
                )
                const cartId = cartResponse.data.cart.id

                await api.post(
                    `/store/carts/${cartId}/line-items`,
                    { offer_id: offer1.id, quantity: 2 },
                    storeHeaders
                )
                await api.post(
                    `/store/carts/${cartId}/line-items`,
                    { offer_id: offer2.id, quantity: 1 },
                    storeHeaders
                )

                return cartId
            }

            const methodsOf = async (cartId: string) => {
                const response = await api.get(`/store/carts/${cartId}`, storeHeaders)
                return (response.data.cart.shipping_methods ?? []) as {
                    shipping_option_id: string
                }[]
            }

            const chooseCarriage = async (cartId: string, optionId: string) =>
                api
                    .post(
                        `/store/carts/${cartId}/shipping-methods`,
                        { option_id: optionId },
                        storeHeaders
                    )
                    .catch((error: any) => error.response)

            it("keeps BOTH carriages when a second producer's is added", async () => {
                // The whole incident in three calls. Before the fix the second
                // POST returned 200 and left the cart with ZERO methods.
                const cartId = await twoProducerCart()

                await chooseCarriage(cartId, option1.id)
                expect(await methodsOf(cartId)).toHaveLength(1)

                await chooseCarriage(cartId, option2.id)

                const methods = await methodsOf(cartId)
                expect(methods).toHaveLength(2)
                expect(methods.map((m) => m.shipping_option_id).sort()).toEqual(
                    [option1.id, option2.id].sort()
                )
            })

            it("keeps both carriages through a later cart change", async () => {
                // The cull runs on EVERY cart mutation, not only on the add — so
                // a fix that only guarded the add path would still lose the
                // freight when the buyer changed a quantity.
                const cartId = await twoProducerCart()
                await chooseCarriage(cartId, option1.id)
                await chooseCarriage(cartId, option2.id)

                await api.post(
                    `/store/carts/${cartId}/line-items`,
                    { offer_id: offer1.id, quantity: 1 },
                    storeHeaders
                )

                expect(await methodsOf(cartId)).toHaveLength(2)
            })

            it("replaces a producer's own carriage rather than stacking it", async () => {
                // Per SELLER, not per cart: choosing again for the same producer
                // must swap their row, and must not touch the other producer's.
                const cartId = await twoProducerCart()
                await chooseCarriage(cartId, option1.id)
                await chooseCarriage(cartId, option2.id)

                await chooseCarriage(cartId, option1.id)

                const methods = await methodsOf(cartId)
                expect(methods).toHaveLength(2)
                expect(methods.map((m) => m.shipping_option_id).sort()).toEqual(
                    [option1.id, option2.id].sort()
                )
            })

            it("refuses a carriage the cart would lose, instead of swallowing both", async () => {
                // The heart of it. `orphanOption` sits on a profile no item in
                // this cart requires, which is exactly the production data. The
                // refusal is the fix: accepted-then-deleted is the outcome that
                // must never happen again.
                const cartId = await twoProducerCart()
                await chooseCarriage(cartId, option1.id)

                const response = await chooseCarriage(cartId, orphanOption.id)

                expect(response.status).toEqual(400)
                expect(response.data.message).toContain("shipping profile")

                // And the carriage already chosen is untouched — the incident was
                // that BOTH went.
                const methods = await methodsOf(cartId)
                expect(methods).toHaveLength(1)
                expect(methods[0].shipping_option_id).toEqual(option1.id)
            })

            it("still allows a mismatched carriage while it is the only one", async () => {
                // Medusa's cull is gated on `length > 1`, so a single-producer
                // cart on a mismatched profile works today. Refusing it would
                // break a checkout that is not broken, which is why the guard
                // counts the resulting methods rather than judging the profile
                // alone.
                const cartId = await twoProducerCart()

                const response = await chooseCarriage(cartId, orphanOption.id)

                expect(response.status).toEqual(200)
                expect(await methodsOf(cartId)).toHaveLength(1)
            })
        })
    },
})
