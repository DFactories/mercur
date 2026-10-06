process.env.MEDUSA_FF_PRODUCT_REQUEST = "true"

import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { ProductChangeStatus } from "@mercurjs/types"

import {
  adminHeaders,
  createAdminUser,
} from "../../../helpers/create-admin-user"
import { createSellerUser } from "../../../helpers/create-seller-user"

jest.setTimeout(120_000)

/**
 * Production, 2026-10-05: several product-edit requests were waiting and the
 * operator could not tell which products they were for — the products list
 * showed nothing. The lists now say which rows have an open request, and can
 * be narrowed to them.
 */
medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("Products with an edit awaiting review", () => {
      let container: MedusaContainer
      let sellerHeaders: { headers: Record<string, string> }
      let otherHeaders: { headers: Record<string, string> }

      beforeAll(() => {
        container = getContainer()
      })

      beforeEach(async () => {
        await createAdminUser(dbConnection, adminHeaders, container)
        sellerHeaders = (
          await createSellerUser(container, {
            email: "pending-a@test.com",
            name: "Pending A",
          })
        ).headers
        otherHeaders = (
          await createSellerUser(container, {
            email: "pending-b@test.com",
            name: "Pending B",
          })
        ).headers
      })

      const createPublished = async (title: string) => {
        const res = await api.post(
          `/vendor/products`,
          { title, status: "proposed", variants: [{ title: "Default" }] },
          sellerHeaders,
        )
        const id = res.data.product.id as string
        await api.post(`/admin/products/${id}/confirm`, {}, adminHeaders)
        return id
      }

      it("marks and filters products with an open request in the admin list", async () => {
        const edited = await createPublished("Edited")
        const untouched = await createPublished("Untouched")
        const res = await api.post(
          `/vendor/products/${edited}`,
          { title: "Edited v2" },
          sellerHeaders,
        )
        expect(res.data.product_change.status).toBe(ProductChangeStatus.PENDING)

        const all = (await api.get(`/admin/products?limit=50`, adminHeaders))
          .data.products as { id: string; pending_change: { id: string } | null }[]
        expect(all.find((p) => p.id === edited)?.pending_change).toEqual({
          id: res.data.product_change.id,
        })
        expect(all.find((p) => p.id === untouched)?.pending_change).toBeNull()

        const filtered = (
          await api.get(`/admin/products?has_pending_change=true`, adminHeaders)
        ).data.products as { id: string }[]
        expect(filtered.map((p) => p.id)).toEqual([edited])
      })

      it("shows a store only its own open requests", async () => {
        const edited = await createPublished("Shared")
        await api.post(
          `/vendor/products/${edited}`,
          { title: "Shared v2" },
          sellerHeaders,
        )

        const mine = (
          await api.get(`/vendor/products?has_pending_change=true`, sellerHeaders)
        ).data.products as { id: string; pending_change: { id: string } | null }[]
        expect(mine.map((p) => p.id)).toEqual([edited])
        expect(mine[0].pending_change).not.toBeNull()

        const theirs = (
          await api.get(`/vendor/products?has_pending_change=true`, otherHeaders)
        ).data.products
        expect(theirs).toEqual([])

        const listed = (
          await api.get(`/vendor/products?limit=50`, otherHeaders)
        ).data.products as { id: string; pending_change: { id: string } | null }[]
        expect(listed.find((p) => p.id === edited)?.pending_change).toBeNull()
      })
    })
  },
})
