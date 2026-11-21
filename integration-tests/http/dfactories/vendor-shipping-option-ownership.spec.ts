import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
    IFulfillmentModuleService,
    MedusaContainer,
} from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createSellerUser } from "../../helpers/create-seller-user"

/**
 * A shipping option may only stand on things its seller may use.
 *
 * Found on a local database (2026-11-21): an option linked to one producer sat
 * on the service zone of another producer's warehouse, and the storefront then
 * offered it, under the first producer's name, for a cart that held only the
 * second producer's goods. `POST /vendor/shipping-options` linked the new
 * option to the caller and never asked whose service zone it was given.
 *
 * The same question, asked of every id a vendor can send on these routes:
 *
 *   - `service_zone_id` on create: must belong to a warehouse of the caller;
 *   - `shipping_profile_id` on create and on update: the caller's own profile
 *     or a global one (no seller link), never another seller's;
 *   - a rule id on `/:id/rules/batch`: must be a rule of the option in the URL;
 *   - `GET /vendor/fulfillment-sets/:id/service-zones/:zone_id`: the zone must
 *     be a zone of that fulfillment set.
 */

jest.setTimeout(180000)

medusaIntegrationTestRunner({
    testSuite: ({ getContainer, api }) => {
        describe("Vendor - a shipping option stands on the seller's own ground", () => {
            let appContainer: MedusaContainer
            let ownerHeaders: any
            let intruderHeaders: any
            let ownerGround: any
            let intruderGround: any

            let suffixCounter = 0

            /** A warehouse with a shipping service zone, a provider and a profile. */
            const createGround = async (headers: any) => {
                const suffix = `_own_${Date.now()}_${++suffixCounter}`

                const location = (
                    await api.post(
                        `/vendor/stock-locations`,
                        { name: `Warehouse${suffix}` },
                        headers
                    )
                ).data.stock_location

                await api.post(
                    `/vendor/stock-locations/${location.id}/fulfillment-sets`,
                    { name: `Fulfillment Set${suffix}`, type: "shipping" },
                    headers
                )
                const fulfillmentSet = (
                    await api.get(
                        `/vendor/stock-locations/${location.id}?fields=*fulfillment_sets`,
                        headers
                    )
                ).data.stock_location.fulfillment_sets[0]

                const serviceZone = (
                    await api.post(
                        `/vendor/fulfillment-sets/${fulfillmentSet.id}/service-zones`,
                        {
                            name: `Service Zone${suffix}`,
                            geo_zones: [{ type: "country", country_code: "us" }],
                        },
                        headers
                    )
                ).data.fulfillment_set.service_zones[0]

                await api.post(
                    `/vendor/stock-locations/${location.id}/fulfillment-providers`,
                    { add: ["manual_manual"] },
                    headers
                )

                const profile = (
                    await api.post(
                        `/vendor/shipping-profiles`,
                        { name: `Profile${suffix}`, type: "default" },
                        headers
                    )
                ).data.shipping_profile

                return { fulfillmentSet, serviceZone, profile }
            }

            const optionBody = (serviceZoneId: string, shippingProfileId: string) => ({
                name: "Freight",
                service_zone_id: serviceZoneId,
                shipping_profile_id: shippingProfileId,
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
            })

            const optionsOnZone = async (serviceZoneId: string) => {
                const query = appContainer.resolve(ContainerRegistrationKeys.QUERY)
                const { data } = await query.graph({
                    entity: "shipping_option",
                    filters: { service_zone_id: serviceZoneId },
                    fields: ["id", "shipping_profile_id", "rules.*"],
                })
                return data
            }

            beforeAll(async () => {
                appContainer = getContainer()
            })

            // One beforeEach: the runner restores the database before every test.
            beforeEach(async () => {
                ownerHeaders = (
                    await createSellerUser(appContainer, {
                        email: "zone-owner@test.com",
                        name: "Zone Owner",
                    })
                ).headers
                intruderHeaders = (
                    await createSellerUser(appContainer, {
                        email: "zone-intruder@test.com",
                        name: "Zone Intruder",
                    })
                ).headers

                ownerGround = await createGround(ownerHeaders)
                intruderGround = await createGround(intruderHeaders)
            })

            it("refuses an option on another seller's service zone", async () => {
                const response = await api
                    .post(
                        `/vendor/shipping-options`,
                        optionBody(
                            ownerGround.serviceZone.id,
                            intruderGround.profile.id
                        ),
                        intruderHeaders
                    )
                    .catch((e: any) => e.response)

                expect(response.status).toEqual(404)
                expect(await optionsOnZone(ownerGround.serviceZone.id)).toHaveLength(0)
            })

            it("refuses another seller's shipping profile on create", async () => {
                const created = await api
                    .post(
                        `/vendor/shipping-options`,
                        optionBody(
                            intruderGround.serviceZone.id,
                            ownerGround.profile.id
                        ),
                        intruderHeaders
                    )
                    .catch((e: any) => e.response)

                expect(created.status).toEqual(404)
                expect(
                    await optionsOnZone(intruderGround.serviceZone.id)
                ).toHaveLength(0)
            })

            it("refuses another seller's shipping profile on update", async () => {
                const own = await api.post(
                    `/vendor/shipping-options`,
                    optionBody(
                        intruderGround.serviceZone.id,
                        intruderGround.profile.id
                    ),
                    intruderHeaders
                )
                expect(own.status).toEqual(201)

                const updated = await api
                    .post(
                        `/vendor/shipping-options/${own.data.shipping_option.id}`,
                        { shipping_profile_id: ownerGround.profile.id },
                        intruderHeaders
                    )
                    .catch((e: any) => e.response)
                expect(updated.status).toEqual(404)

                const [stored] = await optionsOnZone(intruderGround.serviceZone.id)
                expect(stored.shipping_profile_id).toEqual(intruderGround.profile.id)
            })

            it("accepts a global shipping profile on create and on update", async () => {
                const fulfillmentModule = appContainer.resolve<IFulfillmentModuleService>(
                    Modules.FULFILLMENT
                )
                const globalProfile = await fulfillmentModule.createShippingProfiles({
                    name: "Global Profile",
                    type: "default",
                })

                const created = await api.post(
                    `/vendor/shipping-options`,
                    optionBody(intruderGround.serviceZone.id, globalProfile.id),
                    intruderHeaders
                )
                expect(created.status).toEqual(201)

                const updated = await api.post(
                    `/vendor/shipping-options/${created.data.shipping_option.id}`,
                    { shipping_profile_id: globalProfile.id, name: "Freight 2" },
                    intruderHeaders
                )
                expect(updated.status).toEqual(200)
            })

            it("refuses another option's rule on the rules batch", async () => {
                await api.post(
                    `/vendor/shipping-options`,
                    optionBody(ownerGround.serviceZone.id, ownerGround.profile.id),
                    ownerHeaders
                )
                const own = await api.post(
                    `/vendor/shipping-options`,
                    optionBody(
                        intruderGround.serviceZone.id,
                        intruderGround.profile.id
                    ),
                    intruderHeaders
                )
                const [ownerOption] = await optionsOnZone(ownerGround.serviceZone.id)
                const ownerRule = ownerOption.rules[0]
                const batchUrl = `/vendor/shipping-options/${own.data.shipping_option.id}/rules/batch`

                const updated = await api
                    .post(
                        batchUrl,
                        {
                            update: [
                                {
                                    id: ownerRule.id,
                                    attribute: "enabled_in_store",
                                    operator: "eq",
                                    value: "false",
                                },
                            ],
                        },
                        intruderHeaders
                    )
                    .catch((e: any) => e.response)
                const deleted = await api
                    .post(batchUrl, { delete: [ownerRule.id] }, intruderHeaders)
                    .catch((e: any) => e.response)

                const [after] = await optionsOnZone(ownerGround.serviceZone.id)
                expect(after.rules).toHaveLength(1)
                expect(after.rules[0].value).toEqual("true")
                expect(updated.status).toEqual(404)
                expect(deleted.status).toEqual(404)

                // The seller's own rule still goes through the same door.
                const ownRule = own.data.shipping_option.rules[0]
                const ownDelete = await api.post(
                    batchUrl,
                    { delete: [ownRule.id] },
                    intruderHeaders
                )
                expect(ownDelete.status).toEqual(200)
            })

            it("does not show another seller's service zone through one's own fulfillment set", async () => {
                const response = await api
                    .get(
                        `/vendor/fulfillment-sets/${intruderGround.fulfillmentSet.id}/service-zones/${ownerGround.serviceZone.id}`,
                        intruderHeaders
                    )
                    .catch((e: any) => e.response)
                expect(response.status).toEqual(404)

                const own = await api.get(
                    `/vendor/fulfillment-sets/${intruderGround.fulfillmentSet.id}/service-zones/${intruderGround.serviceZone.id}`,
                    intruderHeaders
                )
                expect(own.status).toEqual(200)
            })
        })
    },
})
