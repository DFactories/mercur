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
    })
  },
})
