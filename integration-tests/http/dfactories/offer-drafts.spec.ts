import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"
import jwt from "jsonwebtoken"

import {
  adminHeaders,
  createAdminUser,
  generatePublishableKey,
  generateStoreHeaders,
} from "../../helpers/create-admin-user"
import { createSellerUser } from "../../helpers/create-seller-user"

/**
 * Offer drafts — "store X sells product Y", with no price or stock yet,
 * created by the supplier importer through the admin API.
 *
 * What must hold, beyond the API working:
 * - a draft never reaches a buyer: not the store offers, products or sellers,
 *   whatever `fields` a client asks for;
 * - one store never sees another store's drafts, and a vendor never sees a
 *   draft's metadata (the producer's own site price among it);
 * - an operator without `offer_draft` grants can neither touch drafts nor see
 *   draft rows in the offers list;
 * - a draft becomes an offer only through the offer routes, with their checks,
 *   and only its own store's offer closes it.
 */

jest.setTimeout(180000)

type Seller = { id: string; headers: any; locationId: string; profileId: string }
type Product = { id: string; variants: { id: string }[] }

const REFERENCE_PRICE = 4_250_000

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("Offer drafts", () => {
      let appContainer: MedusaContainer
      let a: Seller
      let b: Seller
      let product: Product
      let seq = 0

      const key = () => `dfimport:test-${++seq}-${Date.now()}`

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

      const makeProduct = async (
        title: string,
        variantTitles: string[],
        status: "published" | "draft" = "published"
      ): Promise<Product> => {
        const { result } = await createProductsWorkflow(appContainer).run({
          input: {
            products: [
              {
                title,
                status,
                options: [{ title: "Size", values: variantTitles }],
                variants: variantTitles.map((v) => ({
                  title: v,
                  options: { Size: v },
                  manage_inventory: false,
                  prices: [{ currency_code: "usd", amount: 10 }],
                })),
              },
            ],
          } as never,
        })
        return result[0] as unknown as Product
      }

      const createDrafts = (items: Record<string, unknown>[], headers = adminHeaders) =>
        api
          .post(`/admin/offer-drafts`, { offer_drafts: items }, headers)
          .catch((e: { response: any }) => e.response)

      const draftFor = async (
        seller: Seller,
        variantId: string | null,
        target: Product = product
      ) => {
        const response = await createDrafts([
          {
            seller_id: seller.id,
            product_id: target.id,
            variant_id: variantId,
            external_id: key(),
            metadata: { reference_price: { amount: REFERENCE_PRICE } },
          },
        ])
        expect(response.data.results[0].outcome).toEqual("created")
        return response.data.results[0].offer_draft as {
          id: string
          external_id: string
        }
      }

      const createOffer = (seller: Seller, variantId: string, amount = 1000) =>
        api
          .post(
            `/vendor/offers/batch`,
            {
              offers: [
                {
                  sku: `DRAFT-${seller.id}-${++seq}`,
                  variant_id: variantId,
                  shipping_profile_id: seller.profileId,
                  inventory_items: [
                    {
                      title: "Stock",
                      stock_levels: [
                        { location_id: seller.locationId, stocked_quantity: 5 },
                      ],
                    },
                  ],
                  prices: [{ amount, currency_code: "usd" }],
                },
              ],
            },
            seller.headers
          )
          .catch((e: { response: any }) => e.response)

      const getDraft = async (id: string) =>
        (await api.get(`/admin/offer-drafts/${id}`, adminHeaders)).data.offer_draft

      const restrictedAdmin = async (email: string, keys: string[]) => {
        const userModule: any = appContainer.resolve(Modules.USER)
        const rbac: any = appContainer.resolve("rbac")
        const user = await userModule.createUsers({ email })
        const role = await rbac.createRbacRoles({ name: `Role ${email}` })
        const policies = await rbac.listRbacPolicies({})
        for (const policyKey of keys) {
          const [resource, operation] = policyKey.split(":")
          const policy = policies.find(
            (p: { resource: string; operation: string }) =>
              p.resource === resource && p.operation === operation
          )
          expect(policy).toBeDefined()
          await rbac.createRbacRolePolicies({ role_id: role.id, policy_id: policy.id })
        }
        const { jwtSecret, jwtOptions } = appContainer.resolve(
          ContainerRegistrationKeys.CONFIG_MODULE
        ).projectConfig.http
        const token = jwt.sign(
          {
            actor_id: user.id,
            actor_type: "user",
            auth_identity_id: `test_ai_${user.id}`,
            app_metadata: { roles: [role.id] },
          },
          jwtSecret as string,
          { expiresIn: "1d", ...(jwtOptions ?? {}) }
        )
        return { headers: { authorization: `Bearer ${token}` } }
      }

      beforeEach(async () => {
        appContainer = getContainer()
        await createAdminUser(dbConnection, adminHeaders, appContainer)
        a = await setUpSeller("a@test.com", "Store A")
        b = await setUpSeller("b@test.com", "Store B")
        product = await makeProduct("Master product", ["S", "L"])
      })

      describe("admin API", () => {
        it("creates a draft once per key and answers every refusal with its code", async () => {
          const offered = await makeProduct("Offered", ["One"])
          expect((await createOffer(a, offered.variants[0].id)).status).toEqual(201)
          const unpublished = await makeProduct("Unpublished", ["One"], "draft")
          const k1 = key()

          const { data } = await createDrafts([
            { seller_id: b.id, product_id: product.id, variant_id: product.variants[0].id, external_id: k1 },
            { seller_id: b.id, product_id: product.id, variant_id: product.variants[0].id, external_id: k1 },
            { seller_id: b.id, product_id: product.id, variant_id: product.variants[0].id, external_id: key() },
            { seller_id: b.id, product_id: product.id, variant_id: null, external_id: key() },
            { seller_id: b.id, product_id: offered.id, variant_id: offered.variants[0].id, external_id: k1 },
            { seller_id: a.id, product_id: offered.id, variant_id: null, external_id: key() },
            { seller_id: b.id, product_id: unpublished.id, external_id: key() },
            { seller_id: b.id, product_id: product.id, variant_id: offered.variants[0].id, external_id: key() },
            { seller_id: "sel_missing", product_id: product.id, external_id: key() },
          ])

          expect(
            data.results.map(
              (r: { outcome: string; error?: { code: string } }) => r.error?.code ?? r.outcome
            )
          ).toEqual([
            "created",
            "existing",
            "open_draft_exists",
            "open_draft_exists",
            "external_id_conflict",
            "active_offer_exists",
            "product_not_offerable",
            "variant_not_in_product",
            "seller_not_found",
          ])
          expect(data.results[1].offer_draft.id).toEqual(data.results[0].offer_draft.id)
        })

        it("deletes a draft, which frees its key", async () => {
          const draft = await draftFor(b, product.variants[0].id)
          const deleted = await api.delete(`/admin/offer-drafts/${draft.id}`, adminHeaders)
          expect(deleted.data).toEqual({ id: draft.id, object: "offer_draft", deleted: true })

          const again = await createDrafts([
            {
              seller_id: b.id,
              product_id: product.id,
              variant_id: product.variants[0].id,
              external_id: draft.external_id,
            },
          ])
          expect(again.data.results[0].outcome).toEqual("created")
          expect(again.data.results[0].offer_draft.id).not.toEqual(draft.id)
        })

        it("is refused to an operator without offer_draft grants, who also sees no draft rows", async () => {
          const draft = await draftFor(b, product.variants[0].id)
          const operator = await restrictedAdmin("offers-only@test.com", ["offer:read"])

          // Thunks: a request created before the previous one is awaited would
          // reject with no handler attached yet.
          for (const call of [
            () => api.get(`/admin/offer-drafts`, operator),
            () => api.get(`/admin/offer-drafts/${draft.id}`, operator),
            () =>
              api.post(
                `/admin/offer-drafts`,
                { offer_drafts: [{ seller_id: b.id, product_id: product.id, external_id: key() }] },
                operator
              ),
            () => api.delete(`/admin/offer-drafts/${draft.id}`, operator),
          ]) {
            expect((await call().catch((e: { response: any }) => e.response)).status).toEqual(403)
          }

          const listed = await api.get(`/admin/offers?group_by_seller=true`, operator)
          expect(JSON.stringify(listed.data)).not.toContain(draft.id)

          const full = await api.get(
            `/admin/offers?group_by_seller=true&fields=id,product_id,seller_id,offer_ids,offer_draft_ids`,
            adminHeaders
          )
          expect(full.data.offers).toContainEqual(
            expect.objectContaining({
              product_id: product.id,
              seller_id: b.id,
              offer_ids: [],
              offer_draft_ids: [draft.id],
            })
          )
        })
      })

      describe("isolation", () => {
        it("shows a store its own drafts on the offers list, without metadata, and no one else's", async () => {
          const draft = await draftFor(b, product.variants[0].id)
          const fields = "id,variants.id,variants.offers.id"

          const mine = await api.get(
            `/vendor/products?has_offer=true&fields=${fields}`,
            b.headers
          )
          const row = mine.data.products.find((p: { id: string }) => p.id === product.id)
          expect(row.offer_drafts).toEqual([
            expect.objectContaining({ id: draft.id, variant_id: product.variants[0].id }),
          ])
          expect(row.offer_drafts[0]).not.toHaveProperty("metadata")
          expect(JSON.stringify(mine.data)).not.toContain(String(REFERENCE_PRICE))

          const theirs = await api.get(
            `/vendor/products?has_offer=true&fields=${fields}`,
            a.headers
          )
          expect(theirs.data.products.map((p: { id: string }) => p.id)).not.toContain(product.id)

          for (const probe of [
            `/vendor/products/${product.id}?fields=${fields}`,
            `/vendor/products/${product.id}?fields=id,*offer_drafts`,
            `/vendor/products?fields=id,*offer_drafts`,
          ]) {
            const response = await api
              .get(probe, a.headers)
              .catch((e: { response: any }) => e.response)
            expect(JSON.stringify(response.data)).not.toContain(draft.id)
          }
        })

        it("never returns a draft to a buyer, whatever fields are asked for", async () => {
          const draft = await draftFor(b, product.variants[0].id)
          const store = generateStoreHeaders({
            publishableKey: await generatePublishableKey(appContainer),
          })

          for (const probe of [
            `/store/offers?product_id=${product.id}`,
            `/store/products?fields=id,*offer_drafts`,
            `/store/products?fields=id,offer_drafts.metadata`,
            `/store/products/${product.id}?fields=id,*offer_drafts`,
            `/store/sellers?fields=id,*offer_drafts`,
          ]) {
            const response = await api
              .get(probe, store)
              .catch((e: { response: any }) => e.response)
            expect(response.status).toBeLessThan(500)
            const json = JSON.stringify(response.data)
            expect(json).not.toContain(draft.id)
            expect(json).not.toContain(String(REFERENCE_PRICE))
          }
        })
      })

      describe("completion", () => {
        it("closes a draft only through its own store's offer, with the offer checks intact", async () => {
          const draft = await draftFor(b, product.variants[0].id)

          expect((await createOffer(a, product.variants[0].id)).status).toEqual(201)
          expect((await getDraft(draft.id)).status).toEqual("open")

          expect((await createOffer(b, product.variants[0].id, 0)).status).toEqual(400)
          expect((await getDraft(draft.id)).status).toEqual("open")

          const created = await createOffer(b, product.variants[0].id)
          expect(created.status).toEqual(201)
          expect(await getDraft(draft.id)).toMatchObject({
            status: "completed",
            completed_offer_id: created.data.offers[0].id,
          })
        })

        it("closes a whole-product draft with an offer on any of its variants", async () => {
          const draft = await draftFor(b, null)
          expect((await createOffer(b, product.variants[1].id)).status).toEqual(201)
          expect((await getDraft(draft.id)).status).toEqual("completed")
        })
      })
    })
  },
})
