import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import {
  adminHeaders,
  createAdminUser,
  generatePublishableKey,
  generateStoreHeaders,
} from "../../helpers/create-admin-user"
import { createSellerUser } from "../../helpers/create-seller-user"

/**
 * REGRESSION — a scheduled closure must hide a producer only WHILE it is open.
 *
 * Production incident (2026-08-03): a producer set «زمان استراحت» for a window
 * three weeks away and their entire catalogue vanished from the storefront the
 * moment they saved. The visibility filter ANDed
 *
 *   (closed_from IS NULL OR closed_from > now) AND (closed_to IS NULL OR closed_to < now)
 *
 * which, with both dates set, asks for a closure that starts in the future and
 * ended in the past — unsatisfiable, so ANY window hid the seller forever.
 *
 * The suite that existed only covered the ACTIVE window, which is the single
 * case the broken predicate got right; that is exactly how this shipped. The
 * three cases below are the ones nobody was asserting.
 *
 * `/store/sellers`, `/store/offers` and `/store/products` all resolve visibility
 * from one shared definition now (`sellerVisibilityFilters` in
 * `packages/core/src/api/utils/sellers.ts`), so proving it here proves it for
 * the catalogue routes too — and the sellers route is the cheap one to assert,
 * needing no products, offers, prices or inventory.
 */

jest.setTimeout(120000)

const iso = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString()

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("Store - seller closure window visibility", () => {
      let appContainer: MedusaContainer
      let seller: { id: string }
      let storeHeaders: Record<string, Record<string, string>>

      beforeEach(async () => {
        appContainer = getContainer()
        await createAdminUser(dbConnection, adminHeaders, appContainer)

        const created = await createSellerUser(appContainer, {
          email: "closure@test.com",
          name: "Closure Store",
        })
        seller = created.seller as { id: string }

        await api.post(`/admin/sellers/${seller.id}/approve`, {}, adminHeaders)

        const publishableKey = await generatePublishableKey(appContainer)
        storeHeaders = generateStoreHeaders({ publishableKey })
      })

      const setWindow = async (
        closed_from: string | null,
        closed_to: string | null
      ) => {
        await api.post(
          `/admin/sellers/${seller.id}`,
          { closed_from, closed_to },
          adminHeaders
        )
      }

      const isListed = async () => {
        const response = await api.get(`/store/sellers`, storeHeaders)
        expect(response.status).toEqual(200)
        return response.data.sellers.some((s: { id: string }) => s.id === seller.id)
      }

      it("lists a seller with no closure window", async () => {
        expect(await isListed()).toBe(true)
      })

      it("lists a seller whose closure has not started yet", async () => {
        // THE incident: scheduled three weeks out, hidden immediately.
        await setWindow(iso(20), iso(29))
        expect(await isListed()).toBe(true)
      })

      it("lists a seller whose closure has already ended", async () => {
        // The store is supposed to auto-resume once `closed_to` passes; under
        // the old predicate it never came back.
        await setWindow(iso(-30), iso(-20))
        expect(await isListed()).toBe(true)
      })

      it("hides a seller inside an active closure", async () => {
        await setWindow(iso(-1), iso(1))
        expect(await isListed()).toBe(false)
      })

      it("hides a seller on an open-ended closure that has started", async () => {
        await setWindow(iso(-1), null)
        expect(await isListed()).toBe(false)
      })

      it("keeps the seller's own page reachable while a future closure is pending", async () => {
        // The storefront's producer page 404'd live — same predicate, detail route.
        await setWindow(iso(20), iso(29))

        const response = await api.get(
          `/store/sellers/${seller.id}`,
          storeHeaders
        )

        expect(response.status).toEqual(200)
        expect(response.data.seller.id).toEqual(seller.id)
      })
    })
  },
})
