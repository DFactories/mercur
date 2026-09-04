import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ISalesChannelModuleService, MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { MercurModules, SellerStatus } from "@mercurjs/types"
import { createSellerUser } from "../../helpers/create-seller-user"
import { createVendorProduct } from "../../helpers/create-product"

/**
 * The vendor half of the shipping-profile parity rule (TECH_DEBT #104).
 *
 * The rule is one sentence: a shipping option's profile must be a profile the
 * goods it carries actually sit on. Until now it was only enforced where it
 * could no longer be fixed — `addSellerShippingMethodToCartWorkflow` refuses
 * the mismatched option, so the person who sees it is the BUYER, at checkout,
 * and the person who could correct it hears nothing.
 *
 * These tests pin the producer-facing half:
 *
 *   - a profile knows how many of THIS seller's goods sit on it, before any
 *     option is written;
 *   - creating or editing an option onto a profile carrying none of them still
 *     SUCCEEDS — a producer may legitimately make the option first and move
 *     goods onto the profile after — and comes back carrying a warning that
 *     says so;
 *   - a well-matched option carries no warning at all, so the signal keeps
 *     meaning something.
 *
 * The count is deliberately the PRODUCT's profile, not the offer's:
 * `create-offers` links a product to the first offer's profile and the link is
 * one-to-one, so those two can differ — and the product's is the one Medusa's
 * cart-refresh culls against.
 */

jest.setTimeout(180000)

medusaIntegrationTestRunner({
    testSuite: ({ getContainer, api }) => {
        describe("Vendor - shipping profile carries no goods", () => {
            let appContainer: MedusaContainer
            let sellerHeaders: any
            /** The profile the seller's one product actually sits on. */
            let stockedProfile: any
            /** A second profile of the seller's that no product uses. */
            let emptyProfile: any
            let serviceZone: any

            let suffixCounter = 0

            const createShippingOption = async (args: {
                name: string
                shippingProfileId: string
            }) => {
                const response = await api.post(
                    `/vendor/shipping-options`,
                    {
                        name: args.name,
                        service_zone_id: serviceZone.id,
                        shipping_profile_id: args.shippingProfileId,
                        provider_id: "manual_manual",
                        price_type: "flat",
                        type: {
                            label: "Standard",
                            description: "Standard shipping",
                            code: "standard",
                        },
                        prices: [{ currency_code: "usd", amount: 500 }],
                        rules: [
                            {
                                attribute: "enabled_in_store",
                                value: "true",
                                operator: "eq",
                            },
                        ],
                    },
                    sellerHeaders
                )
                return response
            }

            beforeAll(async () => {
                appContainer = getContainer()
            })

            // ONE beforeEach, deliberately: a nested `beforeAll` fixture is rolled
            // back to the top-level snapshot after the first test in this runner,
            // so the second test would run against a seller that no longer exists.
            beforeEach(async () => {
                const sellerResult = await createSellerUser(appContainer, {
                    email: "profile-goods-seller@test.com",
                    name: "Profile Goods Seller",
                })
                sellerHeaders = sellerResult.headers

                const sellerModule: any = appContainer.resolve(MercurModules.SELLER)
                await sellerModule.updateSellers({
                    id: sellerResult.seller.id,
                    status: SellerStatus.OPEN,
                })

                const salesChannelModule =
                    appContainer.resolve<ISalesChannelModuleService>(
                        Modules.SALES_CHANNEL
                    )
                const salesChannel = await salesChannelModule.createSalesChannels({
                    name: "Profile Goods Store",
                })

                const suffix = `_goods_${Date.now()}_${++suffixCounter}`

                const locationResponse = await api.post(
                    `/vendor/stock-locations`,
                    { name: `Warehouse${suffix}` },
                    sellerHeaders
                )
                const stockLocation = locationResponse.data.stock_location

                await api.post(
                    `/vendor/stock-locations/${stockLocation.id}/fulfillment-sets`,
                    { name: `Fulfillment Set${suffix}`, type: "shipping" },
                    sellerHeaders
                )

                const updatedLocation = await api.get(
                    `/vendor/stock-locations/${stockLocation.id}?fields=*fulfillment_sets`,
                    sellerHeaders
                )
                const fulfillmentSet =
                    updatedLocation.data.stock_location.fulfillment_sets[0]

                const serviceZoneResponse = await api.post(
                    `/vendor/fulfillment-sets/${fulfillmentSet.id}/service-zones`,
                    {
                        name: `Service Zone${suffix}`,
                        geo_zones: [{ type: "country", country_code: "us" }],
                    },
                    sellerHeaders
                )
                serviceZone =
                    serviceZoneResponse.data.fulfillment_set.service_zones.find(
                        (z: any) => z.name === `Service Zone${suffix}`
                    )

                await api.post(
                    `/vendor/stock-locations/${stockLocation.id}/fulfillment-providers`,
                    { add: ["manual_manual"] },
                    sellerHeaders
                )
                await api.post(
                    `/vendor/stock-locations/${stockLocation.id}/sales-channels`,
                    { add: [salesChannel.id] },
                    sellerHeaders
                )

                const stockedProfileResponse = await api.post(
                    `/vendor/shipping-profiles`,
                    { name: `Stocked Profile${suffix}`, type: "default" },
                    sellerHeaders
                )
                stockedProfile = stockedProfileResponse.data.shipping_profile

                const emptyProfileResponse = await api.post(
                    `/vendor/shipping-profiles`,
                    { name: `Empty Profile${suffix}`, type: "empty" },
                    sellerHeaders
                )
                emptyProfile = emptyProfileResponse.data.shipping_profile

                const product = await createVendorProduct(api, sellerHeaders, {
                    title: "Profile Goods Product",
                    sku: `PROFILE-GOODS${suffix}`,
                    variantTitle: "Small",
                })
                await api.post(
                    `/vendor/sales-channels/${salesChannel.id}/products`,
                    { add: [product.id] },
                    sellerHeaders
                )

                // The offer is what puts the product on `stockedProfile`: the
                // product↔profile link is written from the first offer that
                // touches it.
                await api.post(
                    `/vendor/offers`,
                    {
                        sku: `OF-PROFILE-GOODS${suffix}`,
                        variant_id: product.variants[0].id,
                        shipping_profile_id: stockedProfile.id,
                        inventory_items: [
                            {
                                title: "Profile Goods Inventory",
                                required_quantity: 1,
                                stock_levels: [
                                    {
                                        location_id: stockLocation.id,
                                        stocked_quantity: 100,
                                    },
                                ],
                            },
                        ],
                        prices: [{ currency_code: "usd", amount: 1000 }],
                    },
                    sellerHeaders
                )
            })

            it("reports how many of the seller's goods sit on a profile", async () => {
                const stocked = await api.get(
                    `/vendor/shipping-profiles/${stockedProfile.id}`,
                    sellerHeaders
                )
                expect(stocked.status).toEqual(200)
                expect(stocked.data.shipping_profile.seller_product_count).toEqual(1)

                const empty = await api.get(
                    `/vendor/shipping-profiles/${emptyProfile.id}`,
                    sellerHeaders
                )
                expect(empty.status).toEqual(200)
                expect(empty.data.shipping_profile.seller_product_count).toEqual(0)
            })

            it("warns — without refusing — when a created option's profile carries no goods", async () => {
                const response = await createShippingOption({
                    name: "Empty Profile Carriage",
                    shippingProfileId: emptyProfile.id,
                })

                // Non-blocking on purpose: creating the option before moving goods
                // onto its profile is a legitimate order of work.
                expect(response.status).toEqual(201)
                expect(response.data.shipping_option.id).toBeTruthy()

                expect(response.data.warning).toEqual(
                    expect.objectContaining({
                        code: "shipping_profile_carries_no_goods",
                        shipping_profile_id: emptyProfile.id,
                        seller_product_count: 0,
                    })
                )
                expect(typeof response.data.warning.message).toEqual("string")
            })

            it("stays silent when the option's profile carries the seller's goods", async () => {
                const response = await createShippingOption({
                    name: "Stocked Profile Carriage",
                    shippingProfileId: stockedProfile.id,
                })

                expect(response.status).toEqual(201)
                expect(response.data.warning).toBeUndefined()
            })

            it("warns when an edit leaves the option on a profile with no goods", async () => {
                const created = await createShippingOption({
                    name: "Moved Carriage",
                    shippingProfileId: stockedProfile.id,
                })
                expect(created.data.warning).toBeUndefined()

                const moved = await api.post(
                    `/vendor/shipping-options/${created.data.shipping_option.id}`,
                    { shipping_profile_id: emptyProfile.id },
                    sellerHeaders
                )

                expect(moved.status).toEqual(200)
                expect(moved.data.warning).toEqual(
                    expect.objectContaining({
                        code: "shipping_profile_carries_no_goods",
                        shipping_profile_id: emptyProfile.id,
                        seller_product_count: 0,
                    })
                )

                // The profile is read from the STORED option, so an edit that does
                // not touch it still reports the mismatch it left in place.
                const renamed = await api.post(
                    `/vendor/shipping-options/${created.data.shipping_option.id}`,
                    { name: "Moved Carriage (renamed)" },
                    sellerHeaders
                )
                expect(renamed.status).toEqual(200)
                expect(renamed.data.warning).toEqual(
                    expect.objectContaining({
                        code: "shipping_profile_carries_no_goods",
                        shipping_profile_id: emptyProfile.id,
                    })
                )
            })
        })
    },
})
