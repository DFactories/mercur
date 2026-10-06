import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  IRegionModuleService,
  ISalesChannelModuleService,
  MedusaContainer,
} from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createProductsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
} from "@medusajs/medusa/core-flows"
import {
  createOffersWorkflow,
  createProductAttributesWorkflow,
} from "@mercurjs/core/workflows"
import { MercurModules, SellerStatus } from "@mercurjs/types"

import {
  adminHeaders,
  createAdminUser,
  generatePublishableKey,
  generateStoreHeaders,
} from "../../helpers/create-admin-user"
import { createSellerUser } from "../../helpers/create-seller-user"

/**
 * Store reads must cost the same number of SQL statements for one row as for
 * a page of them, and no statement may be thrown away.
 *
 * 2026-10-05 production audit: `product_attribute_value` had 2.4M sequential
 * scans for a 149-row table, `price_rule` 760k. Two causes were in this
 * package:
 *   - every product read selected `product_attribute_values.attribute.values`,
 *     which the remote joiner fetches and then returns empty, and
 *     `enrichProductAttributes` read the same values again (via a second
 *     `product_attribute` query) — three statements where one does;
 *   - `/store/offers` priced every sibling offer (several producers on one
 *     variant) with its own `calculatePrices`.
 */

type Knex = {
  on: (event: "query", fn: (q: { sql: string }) => void) => void
  off: (event: "query", fn: (q: { sql: string }) => void) => void
}

const recordSql = async <T>(
  container: MedusaContainer,
  fn: () => Promise<T>
): Promise<{ result: T; statements: string[] }> => {
  const knex = container.resolve(
    ContainerRegistrationKeys.PG_CONNECTION
  ) as unknown as Knex
  const statements: string[] = []
  const record = (q: { sql: string }) => statements.push(q.sql)
  knex.on("query", record)
  try {
    return { result: await fn(), statements }
  } finally {
    knex.off("query", record)
  }
}

const readsAttributeValues = (sql: string) =>
  sql.includes('"product_attribute_value" ')

jest.setTimeout(180000)

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("Store reads batch their lookups", () => {
      let container: MedusaContainer
      let storeHeaders: ReturnType<typeof generateStoreHeaders>
      let salesChannelId: string
      let regionId: string

      beforeEach(async () => {
        container = getContainer()
        await createAdminUser(dbConnection, adminHeaders, container)

        const salesChannel = await container
          .resolve<ISalesChannelModuleService>(Modules.SALES_CHANNEL)
          .createSalesChannels({ name: "Batching Store" })
        salesChannelId = salesChannel.id

        const region = await container
          .resolve<IRegionModuleService>(Modules.REGION)
          .createRegions({
            name: "Batching Region",
            currency_code: "usd",
            countries: ["us"],
          })
        regionId = region.id

        const apiKey = await generatePublishableKey(container)
        storeHeaders = generateStoreHeaders({ publishableKey: apiKey })
        await container.resolve(ContainerRegistrationKeys.LINK).create({
          [Modules.API_KEY]: { publishable_key_id: apiKey.id },
          [Modules.SALES_CHANNEL]: { sales_channel_id: salesChannelId },
        })
      })

      const createMaterialAttribute = async () => {
        const { result } = await createProductAttributesWorkflow(container).run({
          input: {
            attributes: [
              {
                name: "Material",
                handle: "material",
                type: "single_select",
                values: ["Paper", "Plastic", "Foil"].map((name, rank) => ({
                  name,
                  rank,
                })),
              },
            ],
          },
        })
        const attributeId = (result as { id: string }[])[0].id
        const { data } = await container
          .resolve(ContainerRegistrationKeys.QUERY)
          .graph({
            entity: "product_attribute_value",
            fields: ["id", "name"],
            filters: { attribute_id: attributeId },
          })
        return {
          attributeId,
          valueIds: (data as { id: string }[]).map((v) => v.id),
        }
      }

      const createProductsWithMaterial = async (
        count: number,
        material: { attributeId: string; valueIds: string[] }
      ) => {
        const { result } = await createProductsWorkflow(container).run({
          input: {
            products: Array.from({ length: count }, (_, i) => ({
              title: `Batching product ${Date.now()}-${i}`,
              status: "published" as const,
              sales_channels: [{ id: salesChannelId }],
              options: [{ title: "Size", values: ["One"] }],
              variants: [
                { title: "One", options: { Size: "One" }, manage_inventory: false },
              ],
            })),
          },
        })
        const ids = (result as { id: string }[]).map((p) => p.id)
        for (const [i, id] of ids.entries()) {
          const res = await api.post(
            `/admin/products/${id}/attributes/batch`,
            {
              add: [
                {
                  id: material.attributeId,
                  value_ids: [material.valueIds[i % material.valueIds.length]],
                },
              ],
            },
            adminHeaders
          )
          expect(res.status).toEqual(200)
        }
        return ids
      }

      it("reads attribute values in a fixed number of statements, whatever the page size", async () => {
        const material = await createMaterialAttribute()
        const first = await createProductsWithMaterial(1, material)

        const one = await recordSql(container, () =>
          api.get(`/store/products?id[]=${first[0]}`, storeHeaders)
        )
        expect(one.result.status).toEqual(200)

        const rest = await createProductsWithMaterial(4, material)
        const ids = [...first, ...rest]
        const five = await recordSql(container, () =>
          api.get(
            `/store/products?${ids.map((id) => `id[]=${id}`).join("&")}`,
            storeHeaders
          )
        )
        expect(five.result.status).toEqual(200)
        expect(five.result.data.products).toHaveLength(5)

        // One read for the linked values, one for each attribute's full value
        // set. Before: a third, discarded by the joiner, on every request.
        const attributeReads = (statements: string[]) =>
          statements.filter(readsAttributeValues)
        expect(attributeReads(one.statements)).toHaveLength(2)
        expect(attributeReads(five.statements)).toHaveLength(2)

        for (const product of five.result.data.products as {
          attributes: {
            id: string
            values: { name: string }[]
            all_values: { name: string }[]
          }[]
        }[]) {
          const grouped = product.attributes.find(
            (a) => a.id === material.attributeId
          )
          expect(grouped?.values).toHaveLength(1)
          expect(grouped?.all_values.map((v) => v.name)).toEqual([
            "Paper",
            "Plastic",
            "Foil",
          ])
        }
      })

      it("prices sibling offers in one call per sibling rank, each at its own price", async () => {
        const { result: locations } = await createStockLocationsWorkflow(
          container
        ).run({ input: { locations: [{ name: "Batching WH" }] } })
        const { result: profiles } = await createShippingProfilesWorkflow(
          container
        ).run({ input: { data: [{ name: "Batching", type: "default" }] } })

        const { result: products } = await createProductsWorkflow(container).run({
          input: {
            products: [
              {
                title: "Shared master",
                status: "published",
                sales_channels: [{ id: salesChannelId }],
                options: [{ title: "Size", values: ["S", "L"] }],
                variants: [
                  { title: "S", options: { Size: "S" }, manage_inventory: false },
                  { title: "L", options: { Size: "L" }, manage_inventory: false },
                ],
              },
            ],
          },
        })
        const product = (
          products as { id: string; variants: { id: string }[] }[]
        )[0]

        // Two producers on BOTH variants: every price set holds two offers,
        // and on each one the second producer is the cheaper.
        const sellerModule = container.resolve(MercurModules.SELLER) as {
          updateSellers: (data: { id: string; status: string }) => Promise<unknown>
        }
        const priced: { offerId: string; amount: number }[] = []
        for (const [s, base] of [
          ["a", 5000],
          ["b", 3000],
        ] as const) {
          const { seller } = await createSellerUser(container, {
            email: `batching-${s}@test.com`,
            name: `Batching ${s}`,
          })
          const sellerId = (seller as { id: string }).id
          await sellerModule.updateSellers({
            id: sellerId,
            status: SellerStatus.OPEN,
          })

          for (const [v, variant] of product.variants.entries()) {
            const amount = base + v * 100
            const { result } = await createOffersWorkflow(container).run({
              input: {
                offers: [
                  {
                    seller_id: sellerId,
                    created_by: "integration-test",
                    sku: `BATCH-${s}-${v}-${Date.now()}`,
                    variant_id: variant.id,
                    shipping_profile_id: (profiles as { id: string }[])[0].id,
                    inventory_items: [
                      {
                        sku: `BATCH-INV-${s}-${v}-${Date.now()}`,
                        stock_levels: [
                          {
                            location_id: (locations as { id: string }[])[0].id,
                            stocked_quantity: 10,
                          },
                        ],
                      },
                    ],
                    prices: [{ amount, currency_code: "usd" }],
                  },
                ],
              },
            })
            priced.push({ offerId: (result as { id: string }[])[0].id, amount })
          }
        }

        const pricing = container.resolve(Modules.PRICING)
        const calls = jest.spyOn(pricing, "calculatePrices")
        const response = await api.get(
          `/store/offers?product_id=${product.id}&region_id=${regionId}` +
            `&fields=id,calculated_price,product_variant.price_set.id`,
          storeHeaders
        )
        const callCount = calls.mock.calls.length
        calls.mockRestore()

        expect(response.status).toEqual(200)
        const amountByOffer = new Map(
          (
            response.data.offers as {
              id: string
              calculated_price: { calculated_amount: number } | null
            }[]
          ).map((o) => [o.id, o.calculated_price?.calculated_amount])
        )
        for (const { offerId, amount } of priced) {
          expect(amountByOffer.get(offerId)).toEqual(amount)
        }
        // Four offers, two per price set: two calls. It was one per offer.
        expect(callCount).toEqual(2)
      })
    })
  },
})
