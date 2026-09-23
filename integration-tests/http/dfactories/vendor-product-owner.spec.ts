import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  adminHeaders,
  createAdminUser,
} from "../../helpers/create-admin-user"
import { createSellerUser } from "../../helpers/create-seller-user"

/**
 * REGRESSION — a product a producer creates in the vendor panel belongs to them.
 *
 * Production audit (2026-09-23): of six products, the four oldest had a
 * `product_seller` row and the two created through `POST /vendor/products`
 * had none. `createProductsWorkflow` writes that link only from each product's
 * `seller_ids`, and the vendor route never set it — it passed the seller only
 * as `created_by`, which feeds the audit trail and nothing else. The
 * validator is `.strict()`, so no client could have supplied it either.
 *
 * The owner is the seller in the request's context, never anything in the
 * body: the second case pins that a body naming some other store is refused
 * rather than trusted.
 */

jest.setTimeout(120000)

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("Vendor - product owner on create", () => {
      let appContainer: MedusaContainer
      let seller: { id: string }
      let sellerHeaders: any
      let otherSeller: { id: string }

      const ownersOf = async (productId: string) => {
        const query = appContainer.resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "product_seller",
          fields: ["seller_id"],
          filters: { product_id: productId },
        })
        return (data as { seller_id: string }[]).map((row) => row.seller_id)
      }

      beforeEach(async () => {
        appContainer = getContainer()
        await createAdminUser(dbConnection, adminHeaders, appContainer)

        const created = await createSellerUser(appContainer, {
          email: "owner@test.com",
          name: "Owner Store",
        })
        seller = created.seller as { id: string }
        sellerHeaders = created.headers

        const other = await createSellerUser(appContainer, {
          email: "not-owner@test.com",
          name: "Other Store",
        })
        otherSeller = other.seller as { id: string }
      })

      it("links the product to the seller who created it", async () => {
        const response = await api.post(
          "/vendor/products",
          { title: "Owned Product", variants: [{ title: "Default" }] },
          sellerHeaders
        )
        expect(response.status).toEqual(201)
        const productId = response.data.product.id

        expect(await ownersOf(productId)).toEqual([seller.id])

        const listed = await api.get(
          `/admin/sellers/${seller.id}/products`,
          adminHeaders
        )
        expect(listed.data.products.map((p: { id: string }) => p.id)).toEqual([
          productId,
        ])
      })

      // The Crawler importer wrote this link itself through the admin route
      // while the vendor route did not; it keeps doing so until it is updated,
      // so re-adding the owner the route already wrote must stay harmless.
      it("accepts the admin route re-adding the owner it already has", async () => {
        const response = await api.post(
          "/vendor/products",
          { title: "Imported Product", variants: [{ title: "Default" }] },
          sellerHeaders
        )
        const productId = response.data.product.id

        const relink = await api.post(
          `/admin/products/${productId}/sellers`,
          { add: [seller.id], remove: [] },
          adminHeaders
        )
        expect(relink.status).toEqual(200)

        expect(await ownersOf(productId)).toEqual([seller.id])
      })

      it("refuses a body that names another store as the owner", async () => {
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

        expect(error.status).toEqual(400)

        const listed = await api.get(
          `/admin/sellers/${otherSeller.id}/products`,
          adminHeaders
        )
        expect(listed.data.products).toEqual([])
      })
    })
  },
})
