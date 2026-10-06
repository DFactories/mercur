// The approval queue is ON in production; the shared test env turns it off.
process.env.MEDUSA_FF_PRODUCT_REQUEST = "true"

import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  ProductChangeActionType,
  ProductChangeStatus,
} from "@mercurjs/types"

import {
  adminHeaders,
  createAdminUser,
} from "../../../helpers/create-admin-user"
import { createSellerUser } from "../../../helpers/create-seller-user"

jest.setTimeout(120_000)

/**
 * Production, 2026-10-05: an operator editing a published product was refused
 * every second save — "There is already an active update request…" — because
 * a store may hold only one open request per product. Decided the same day:
 * the next save joins the open request, and the operator reviews one combined
 * change with the latest value of everything.
 */
medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("Vendor edits to a published product join the open request", () => {
      let container: MedusaContainer
      let sellerHeaders: { headers: Record<string, string> }

      beforeAll(() => {
        container = getContainer()
      })

      beforeEach(async () => {
        await createAdminUser(dbConnection, adminHeaders, container)
        const res = await createSellerUser(container, {
          email: "merge-seller@test.com",
          name: "Merge Seller",
        })
        sellerHeaders = res.headers
      })

      const createDraft = async (title: string) => {
        const res = await api.post(
          `/vendor/products`,
          { title, status: "proposed", variants: [{ title: "Default" }] },
          sellerHeaders,
        )
        return res.data.product.id as string
      }

      const publish = (id: string) =>
        api.post(`/admin/products/${id}/confirm`, {}, adminHeaders)

      const product = async (id: string) =>
        (await api.get(`/vendor/products/${id}`, sellerHeaders)).data.product

      const preview = async (id: string) =>
        (await api.get(`/admin/products/${id}/preview`, adminHeaders)).data
          .product_change

      const confirm = (changeId: string) =>
        api.post(
          `/admin/product-changes/${changeId}/confirm`,
          {},
          adminHeaders,
        )

      it("keeps one request and shows the latest value of a field edited twice", async () => {
        const id = await createDraft("Original")
        await publish(id)

        const first = await api.post(
          `/vendor/products/${id}`,
          { title: "First" },
          sellerHeaders,
        )
        const second = await api.post(
          `/vendor/products/${id}`,
          { title: "Second", subtitle: "Sub" },
          sellerHeaders,
        )

        expect(second.data.product_change.id).toBe(first.data.product_change.id)
        expect(second.data.product_change.status).toBe(
          ProductChangeStatus.PENDING,
        )

        const change = await preview(id)
        const titleUpdates = change.actions.filter(
          (a: { action: string; details: { field?: string } }) =>
            a.action === ProductChangeActionType.UPDATE &&
            a.details.field === "title",
        )
        expect(titleUpdates).toHaveLength(1)
        expect(titleUpdates[0].details.value).toBe("Second")
        expect(titleUpdates[0].details.previous_value).toBe("Original")

        await confirm(change.id)
        const applied = await product(id)
        expect(applied.title).toBe("Second")
        expect(applied.subtitle).toBe("Sub")
      })

      it("merges two edits of one variant", async () => {
        const id = await createDraft("Variant merge")
        await publish(id)
        const variantId = (await product(id)).variants[0].id

        const a = await api.post(
          `/vendor/products/${id}/variants/${variantId}`,
          { title: "Renamed" },
          sellerHeaders,
        )
        const b = await api.post(
          `/vendor/products/${id}/variants/${variantId}`,
          { sku: "SKU-1" },
          sellerHeaders,
        )
        expect(b.data.product_change.id).toBe(a.data.product_change.id)

        const change = await preview(id)
        const variantUpdates = change.actions.filter(
          (x: { action: string }) =>
            x.action === ProductChangeActionType.VARIANT_UPDATE,
        )
        expect(variantUpdates).toHaveLength(1)
        expect(variantUpdates[0].details.fields).toEqual({
          title: "Renamed",
          sku: "SKU-1",
        })

        await confirm(change.id)
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "variant",
          fields: ["id", "title", "sku"],
          filters: { id: variantId },
        })
        expect(data[0]).toEqual(
          expect.objectContaining({ title: "Renamed", sku: "SKU-1" }),
        )
      })

      it("applies value additions to two different axes saved separately", async () => {
        const id = await createDraft("Two axes")
        for (const title of ["حجم", "رنگ"]) {
          const res = await api.post(
            `/vendor/products/${id}/attributes/batch`,
            {
              add: [
                {
                  title,
                  values: [title === "حجم" ? "300 سی سی" : "نقره‌ای"],
                  is_variant_axis: true,
                },
              ],
            },
            sellerHeaders,
          )
          expect(res.status).toBe(202)
        }
        await publish(id)

        const attributes = (await product(id)).attributes as {
          id: string
          name: string
        }[]
        const volume = attributes.find((a) => a.name === "حجم")!
        const color = attributes.find((a) => a.name === "رنگ")!

        const first = await api.post(
          `/vendor/products/${id}/attributes/batch`,
          { update: [{ id: volume.id, add: [{ value: "500 سی سی" }] }] },
          sellerHeaders,
        )
        const second = await api.post(
          `/vendor/products/${id}/attributes/batch`,
          { update: [{ id: color.id, add: [{ value: "طلایی" }] }] },
          sellerHeaders,
        )
        expect(second.data.product_change.id).toBe(first.data.product_change.id)

        await confirm(first.data.product_change.id)

        const after = (await product(id)).attributes as {
          name: string
          all_values?: { name: string }[]
          values: { name: string }[]
        }[]
        const names = (name: string) =>
          (after.find((a) => a.name === name)?.all_values ?? [])
            .map((v) => v.name)
            .sort()
        expect(names("حجم")).toEqual(["300 سی سی", "500 سی سی"])
        expect(names("رنگ")).toEqual(["طلایی", "نقره‌ای"])
      })

      it("withdraws every joined edit on cancel, and the next save opens a new request", async () => {
        const id = await createDraft("Cancel all")
        await publish(id)

        const first = await api.post(
          `/vendor/products/${id}`,
          { title: "A" },
          sellerHeaders,
        )
        await api.post(`/vendor/products/${id}`, { subtitle: "B" }, sellerHeaders)
        await api.post(`/vendor/products/${id}/cancel`, {}, sellerHeaders)

        expect(await preview(id)).toBeNull()
        const untouched = await product(id)
        expect(untouched.title).toBe("Cancel all")

        const next = await api.post(
          `/vendor/products/${id}`,
          { title: "C" },
          sellerHeaders,
        )
        expect(next.data.product_change.id).not.toBe(
          first.data.product_change.id,
        )
      })

      it("lets an operator reject the request with a reason", async () => {
        const id = await createDraft("Reject me")
        await publish(id)
        const edit = await api.post(
          `/vendor/products/${id}`,
          { title: "Unwanted" },
          sellerHeaders,
        )

        const res = await api.post(
          `/admin/product-changes/${edit.data.product_change.id}/reject`,
          { reason: "عکس‌ها ناقص است" },
          adminHeaders,
        )

        expect(res.data.product_change.status).toBe(
          ProductChangeStatus.DECLINED,
        )
        expect(res.data.product_change.declined_reason).toBe("عکس‌ها ناقص است")
        expect((await product(id)).title).toBe("Reject me")
      })

      it("opens a new request once the previous one was confirmed", async () => {
        const id = await createDraft("After review")
        await publish(id)

        const first = await api.post(
          `/vendor/products/${id}`,
          { title: "Reviewed" },
          sellerHeaders,
        )
        await confirm(first.data.product_change.id)

        const next = await api.post(
          `/vendor/products/${id}`,
          { title: "Next" },
          sellerHeaders,
        )
        expect(next.data.product_change.id).not.toBe(
          first.data.product_change.id,
        )
        expect(next.data.product_change.status).toBe(
          ProductChangeStatus.PENDING,
        )
      })
    })
  },
})
