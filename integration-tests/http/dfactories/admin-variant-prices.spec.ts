import { MedusaContainer } from "@medusajs/framework/types"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"

import { createProductsWorkflow } from "@mercurjs/core/workflows"

import {
  adminHeaders,
  createAdminUser,
} from "../../helpers/create-admin-user"

jest.setTimeout(60000)

/**
 * Prices belong to offers, not variants: an offer writes its price into the
 * variant's price set tagged with an `offer_id` rule, and the storefront
 * resolves through that rule. A price written straight onto the variant carries
 * no rule, so it matches every pricing context — a price belonging to no seller,
 * leaking into the catalogue. Variant create already refuses `prices`; update
 * used to accept them and hand them to Medusa's workflow, which really does
 * write them.
 */
medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("Admin - variant prices are offer-owned", () => {
      let appContainer: MedusaContainer
      let productId: string
      let variantId: string

      beforeAll(() => {
        appContainer = getContainer()
      })

      beforeEach(async () => {
        await createAdminUser(dbConnection, adminHeaders, appContainer)

        const { result } = await createProductsWorkflow(appContainer).run({
          input: {
            products: [
              {
                title: "Priced Product",
                status: "published",
                variants: [{ title: "Default", options: {} }],
              },
            ],
            created_by: "admin_user",
          },
        })
        productId = (result as { id: string }[])[0].id

        // the create workflow does not populate variants on its result
        const created = (
          await api.get(`/admin/products/${productId}`, adminHeaders)
        ).data.product
        variantId = created.variants[0].id
      })

      const updateVariant = (body: Record<string, unknown>) =>
        api
          .post(
            `/admin/products/${productId}/variants/${variantId}`,
            body,
            adminHeaders
          )
          .catch((e) => e.response)

      it("rejects prices on variant update", async () => {
        const response = await updateVariant({
          title: "Renamed",
          prices: [{ currency_code: "irr", amount: 1000 }],
        })

        expect(response.status).toEqual(400)
      })

      it("still accepts an update that carries no prices", async () => {
        const response = await updateVariant({ title: "Renamed" })

        expect(response.status).toEqual(200)
      })

      it("rejects prices on variant create too", async () => {
        const response = await api
          .post(
            `/admin/products/${productId}/variants`,
            {
              title: "Second",
              options: {},
              prices: [{ currency_code: "irr", amount: 1000 }],
            },
            adminHeaders
          )
          .catch((e) => e.response)

        expect(response.status).toEqual(400)
      })
    })
  },
})
