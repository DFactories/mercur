import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  adminHeaders,
  createAdminUser,
} from "../../helpers/create-admin-user"
import { createSellerUser } from "../../helpers/create-seller-user"

/**
 * REGRESSION — a product a producer creates is a SHARED master product.
 *
 * Mercur's catalog has no product owner. What looks like ownership is split
 * into selling eligibility (the operator-managed `product_seller` allowlist)
 * and creator attribution (the product's change history). "Creating a product
 * does not assign it to the creator."
 *
 * Core `2.3.1-dfactories.27` wrote a `product_seller` row for the creator on
 * every `POST /vendor/products`. Because that link IS the allowlist, every
 * product a producer created became exclusive to them: hidden from every other
 * producer's catalog, so nobody else could ever offer on it — the exact
 * opposite of a master catalog. This pins the upstream contract again:
 *
 * - no allowlist row is written on create;
 * - the creator still sees and manages its unpublished submission through
 *   attribution, and nobody else sees it;
 * - once published, every other seller sees it;
 * - an explicit operator restriction still hides it from the others.
 */

jest.setTimeout(120000)

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("Vendor - created products are shared master products", () => {
      let appContainer: MedusaContainer
      let seller: { id: string }
      let sellerHeaders: any
      let otherSeller: { id: string }
      let otherHeaders: any

      const allowlistOf = async (productId: string) => {
        const query = appContainer.resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "product_seller",
          fields: ["seller_id"],
          filters: { product_id: productId },
        })
        return (data as { seller_id: string }[]).map((row) => row.seller_id)
      }

      const listedTo = async (headers: any) => {
        const response = await api.get(`/vendor/products?limit=100`, headers)
        return response.data.products.map((p: { id: string }) => p.id)
      }

      beforeEach(async () => {
        appContainer = getContainer()
        await createAdminUser(dbConnection, adminHeaders, appContainer)

        const created = await createSellerUser(appContainer, {
          email: "creator@test.com",
          name: "Creator Store",
        })
        seller = created.seller as { id: string }
        sellerHeaders = created.headers

        const other = await createSellerUser(appContainer, {
          email: "not-creator@test.com",
          name: "Other Store",
        })
        otherSeller = other.seller as { id: string }
        otherHeaders = other.headers
      })

      it("writes no allowlist row for the creator", async () => {
        const response = await api.post(
          "/vendor/products",
          { title: "Shared Product", variants: [{ title: "Default" }] },
          sellerHeaders
        )
        expect(response.status).toEqual(201)

        expect(await allowlistOf(response.data.product.id)).toEqual([])
      })

      it("keeps an unpublished submission to its creator, and shares it once published", async () => {
        const response = await api.post(
          "/vendor/products",
          {
            title: "Submission",
            status: "draft",
            variants: [{ title: "Default" }],
          },
          sellerHeaders
        )
        const productId = response.data.product.id

        expect(await listedTo(sellerHeaders)).toContain(productId)
        expect(await listedTo(otherHeaders)).not.toContain(productId)

        const reached = await api
          .get(`/vendor/products/${productId}`, otherHeaders)
          .catch((e: { response: unknown }) => e.response)
        expect((reached as { status: number }).status).toEqual(404)

        await api.post(
          `/admin/products/${productId}`,
          { status: "published" },
          adminHeaders
        )

        expect(await listedTo(sellerHeaders)).toContain(productId)
        expect(await listedTo(otherHeaders)).toContain(productId)
      })

      it("still lets the operator restrict a product explicitly", async () => {
        const response = await api.post(
          "/vendor/products",
          {
            title: "Restricted",
            status: "published",
            variants: [{ title: "Default" }],
          },
          sellerHeaders
        )
        const productId = response.data.product.id

        const restricted = await api.post(
          `/admin/products/${productId}/sellers`,
          { add: [seller.id], remove: [] },
          adminHeaders
        )
        expect(restricted.status).toEqual(200)

        expect(await allowlistOf(productId)).toEqual([seller.id])
        expect(await listedTo(sellerHeaders)).toContain(productId)
        expect(await listedTo(otherHeaders)).not.toContain(productId)
      })

      it("refuses a body that names stores for the allowlist", async () => {
        const error = await api
          .post(
            "/vendor/products",
            {
              title: "Hijacked Product",
              variants: [{ title: "Default" }],
              seller_ids: [otherSeller.id],
            },
            sellerHeaders
          )
          .catch((e: { response: unknown }) => e.response)

        expect((error as { status: number }).status).toEqual(400)

        const listed = await api.get(
          `/admin/sellers/${otherSeller.id}/products`,
          adminHeaders
        )
        expect(listed.data.products).toEqual([])
      })

      /**
       * REGRESSION — reported from production 2026-10-04. The supplier
       * importer signs in as an admin and creates a producer's catalogue as
       * drafts with `seller_ids: [store]`. Attribution is the admin's user id,
       * so the store's own list showed none of them while the admin saw all.
       */
      describe("an unpublished product an operator created for a store", () => {
        // Created through the admin route (so the attribution is the admin's
        // user id, as in production), then assigned. The importer's own
        // `seller_ids` on create writes the same `product_seller` row; under
        // this Jest harness Medusa's strict create validator answers that field
        // with 400, while production accepts it (200, rows written 2026-10-04).
        const createForStore = async (status: string, sellerIds: string[]) => {
          const response = await api.post(
            "/admin/products",
            {
              title: `Imported ${status}`,
              status,
              // A single-variant product, shaped as the importer sends one.
              variants: [{ title: "Default" }],
            },
            adminHeaders
          )
          expect(response.status).toEqual(200)
          const product = response.data.product as {
            id: string
            variants: { id: string }[]
          }
          const assigned = await api.post(
            `/admin/products/${product.id}/sellers`,
            { add: sellerIds, remove: [] },
            adminHeaders
          )
          expect(assigned.status).toEqual(200)
          return product
        }

        const statusOf = (call: () => Promise<{ status: number }>) =>
          call()
            .then((r) => r.status)
            .catch((e: { response?: { status: number } }) => e.response?.status)

        it("is listed to that store and to nobody else", async () => {
          const product = await createForStore("draft", [seller.id])

          expect(await listedTo(sellerHeaders)).toContain(product.id)
          expect(await listedTo(otherHeaders)).not.toContain(product.id)

          expect(
            await statusOf(() => api.get(`/vendor/products/${product.id}`, sellerHeaders))
          ).toEqual(200)
          expect(
            await statusOf(() => api.get(`/vendor/products/${product.id}`, otherHeaders))
          ).toEqual(404)

          const variants = async (headers: any) =>
            (
              await api.get(`/vendor/product-variants?limit=100`, headers)
            ).data.variants.map((v: { id: string }) => v.id)
          expect(await variants(sellerHeaders)).toContain(product.variants[0].id)
          expect(await variants(otherHeaders)).not.toContain(product.variants[0].id)
        })

        it("can be completed and sent for review by that store", async () => {
          const product = await createForStore("draft", [seller.id])

          expect(
            await statusOf(() =>
              api.post(`/vendor/products/${product.id}`, { subtitle: "x" }, sellerHeaders)
            )
          ).toEqual(202)

          const submitted = await api.post(
            `/vendor/products/${product.id}/submit`,
            {},
            sellerHeaders
          )
          // `proposed` with the product-request flow on, `published` without
          // it (this suite) — either way it left `draft` at the store's hand.
          expect(submitted.status).toEqual(200)
          expect(submitted.data.product.status).not.toEqual("draft")
          expect(await listedTo(sellerHeaders)).toContain(product.id)

          // Another store cannot touch it at any point.
          expect(
            await statusOf(() => api.delete(`/vendor/products/${product.id}`, otherHeaders))
          ).toEqual(404)
        })

        it("never hands a store another store's unpublished submission", async () => {
          // Store A's own draft, then an operator adds store B to its
          // allowlist. Unpublished products are edited and deleted directly,
          // so the assignment must not reach it: only the creator does.
          const created = await api.post(
            "/vendor/products",
            { title: "A's draft", status: "draft", variants: [{ title: "Default" }] },
            sellerHeaders
          )
          const productId = created.data.product.id
          await api.post(
            `/admin/products/${productId}/sellers`,
            { add: [otherSeller.id], remove: [] },
            adminHeaders
          )

          expect(await listedTo(sellerHeaders)).toContain(productId)
          expect(await listedTo(otherHeaders)).not.toContain(productId)
          expect(
            await statusOf(() => api.get(`/vendor/products/${productId}`, otherHeaders))
          ).toEqual(404)
          expect(
            await statusOf(() => api.delete(`/vendor/products/${productId}`, otherHeaders))
          ).toEqual(404)
        })

        it("stays out of other stores' catalogue once published", async () => {
          const product = await createForStore("draft", [seller.id])

          await api.post(
            `/admin/products/${product.id}`,
            { status: "published" },
            adminHeaders
          )

          // Published and restricted to the store it was made for.
          expect(await listedTo(sellerHeaders)).toContain(product.id)
          expect(await listedTo(otherHeaders)).not.toContain(product.id)
        })
      })
    })
  },
})
