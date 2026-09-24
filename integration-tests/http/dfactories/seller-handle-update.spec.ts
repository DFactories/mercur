import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { MercurModules } from "@mercurjs/types"
import {
  adminHeaders,
  createAdminUser,
} from "../../helpers/create-admin-user"
import { createSellerUser } from "../../helpers/create-seller-user"

/**
 * REGRESSION — updating a store must not move its public address.
 *
 * Reproduced 2026-09-24 against core 2.3.1-dfactories.29:
 *
 *   POST /admin/sellers      { name: "Handle Probe", handle: "handle-probe-test", … }
 *   POST /admin/sellers/:id  { name: "Handle Probe", description: "x" }
 *
 * The second call — same name, no handle — rewrote the handle to
 * `handle-probe`. `SellerModuleService.updateSellers` ran the create-time rule
 * "no handle given → derive one from the name" on every update, so any caller
 * that resent the name (the admin store form, `POST /vendor/sellers/me`,
 * scripts) could change `/sellers/<handle>` without anyone asking it to. For a
 * Persian name the new handle is a Persian slug.
 */

jest.setTimeout(120000)

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("Seller update keeps the store handle", () => {
      let appContainer: MedusaContainer

      beforeEach(async () => {
        appContainer = getContainer()
        await createAdminUser(dbConnection, adminHeaders, appContainer)
      })

      const createProbe = async () => {
        const response = await api.post(
          `/admin/sellers`,
          {
            name: "Handle Probe",
            handle: "handle-probe-test",
            email: "handle-probe@test.com",
            currency_code: "usd",
            member: { email: "handle-probe@test.com" },
          },
          adminHeaders
        )
        expect(response.data.seller.handle).toEqual("handle-probe-test")
        return response.data.seller as { id: string }
      }

      const handleOf = async (id: string) =>
        (await api.get(`/admin/sellers/${id}`, adminHeaders)).data.seller
          .handle as string

      it("keeps the handle when an admin update resends the same name", async () => {
        const seller = await createProbe()

        await api.post(
          `/admin/sellers/${seller.id}`,
          { name: "Handle Probe", description: "x" },
          adminHeaders
        )

        expect(await handleOf(seller.id)).toEqual("handle-probe-test")
      })

      it("keeps the handle when the store is renamed", async () => {
        const seller = await createProbe()

        const response = await api.post(
          `/admin/sellers/${seller.id}`,
          { name: "فروشگاه تازه" },
          adminHeaders
        )

        expect(response.data.seller.name).toEqual("فروشگاه تازه")
        expect(await handleOf(seller.id)).toEqual("handle-probe-test")
      })

      it("treats a blank handle as 'no change', not as 'clear' or 'regenerate'", async () => {
        const seller = await createProbe()

        await api.post(
          `/admin/sellers/${seller.id}`,
          { name: "Handle Probe", handle: "" },
          adminHeaders
        )

        expect(await handleOf(seller.id)).toEqual("handle-probe-test")
      })

      it("still changes the handle when one is given explicitly", async () => {
        const seller = await createProbe()

        await api.post(
          `/admin/sellers/${seller.id}`,
          { name: "Handle Probe", handle: "moved-on-purpose" },
          adminHeaders
        )

        expect(await handleOf(seller.id)).toEqual("moved-on-purpose")
      })

      it("keeps the handle when the vendor renames their own store", async () => {
        const { seller, headers } = await createSellerUser(appContainer, {
          email: "vendor-handle@test.com",
          name: "Vendor Handle",
        })
        const sellerId = (seller as { id: string }).id
        await api.post(`/admin/sellers/${sellerId}/approve`, {}, adminHeaders)
        expect(await handleOf(sellerId)).toEqual("vendor-handle")

        const response = await api.post(
          `/vendor/sellers/me`,
          { name: "Vendor Renamed", description: "x" },
          headers
        )

        expect(response.status).toEqual(200)
        expect(response.data.seller.name).toEqual("Vendor Renamed")
        expect(response.data.seller.handle).toEqual("vendor-handle")
      })

      it("returns one seller for one seller updated through the module", async () => {
        const seller = await createProbe()
        const service = appContainer.resolve(MercurModules.SELLER) as any

        const updated = await service.updateSellers({
          id: seller.id,
          name: "Handle Probe",
        })

        expect(Array.isArray(updated)).toBe(false)
        expect(updated.handle).toEqual("handle-probe-test")
      })
    })
  },
})
