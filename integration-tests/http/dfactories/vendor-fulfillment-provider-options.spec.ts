import { medusaIntegrationTestRunner } from "@medusajs/test-utils"

import {
  adminHeaders,
  createAdminUser,
} from "../../helpers/create-admin-user"
import { createSellerUser } from "../../helpers/create-seller-user"

/**
 * REGRESSION — the vendor shipping-option form asks for its provider's options
 * at `/vendor/fulfillment-providers/:id/options`, a route that did not exist:
 * production answered 404 every time a producer opened the form (twelve times
 * on 2026-10-08 alone). The admin route has always served the same list.
 */

jest.setTimeout(120000)

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("GET /vendor/fulfillment-providers/:id/options", () => {
      let headers: any

      beforeEach(async () => {
        const container = getContainer()
        await createAdminUser(dbConnection, adminHeaders, container)
        headers = (
          await createSellerUser(container, {
            email: "options@test.com",
            name: "Options Store",
          })
        ).headers
      })

      it("lists the manual provider's fulfillment options", async () => {
        const response = await api.get(
          `/vendor/fulfillment-providers/manual_manual/options`,
          headers
        )

        expect(response.status).toEqual(200)
        expect(response.data.fulfillment_options.length).toBeGreaterThan(0)
        expect(response.data.count).toEqual(
          response.data.fulfillment_options.length
        )
      })

      it("answers 404 for a provider that does not exist", async () => {
        const response = await api
          .get(`/vendor/fulfillment-providers/nope_nope/options`, headers)
          .catch((e: { response: any }) => e.response)

        expect(response.status).toEqual(404)
      })
    })
  },
})
