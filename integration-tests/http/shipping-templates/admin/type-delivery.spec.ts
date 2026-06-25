import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import {
  adminHeaders,
  createAdminUser,
} from "../../../helpers/create-admin-user"

jest.setTimeout(60000)

/**
 * Phase 1 of the admin shipping-templates feature: the
 * shipping_option_type_delivery module + its read-only link to the core
 * shipping_option_type + the admin set/get route.
 */
medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("Admin - shipping option type delivery (templates)", () => {
      let container: MedusaContainer

      beforeAll(() => {
        container = getContainer()
      })

      beforeEach(async () => {
        await createAdminUser(dbConnection, adminHeaders, container)
      })

      it("upserts delivery on a type, reads it back, and the link resolves", async () => {
        // Seed a shipping option type directly via the fulfillment service
        // (admin curates these via the dashboard; the HTTP create is exercised
        // there). Here we focus on our module + link + delivery route.
        const fulfillment = container.resolve(Modules.FULFILLMENT)
        const [type] = await fulfillment.createShippingOptionTypes([
          { label: "پست پیشتاز", code: `post-${Date.now()}`, description: "" },
        ])
        const typeId = type.id
        expect(typeId).toBeTruthy()

        // --- Core verification via the module service + link (RBAC-independent) ---
        const service = container.resolve("shipping_option_type_delivery") as {
          listShippingOptionTypeDeliveries: (f: object) => Promise<any[]>
          createShippingOptionTypeDeliveries: (d: object) => Promise<any>
          updateShippingOptionTypeDeliveries: (d: object) => Promise<any>
        }

        // create
        await service.createShippingOptionTypeDeliveries({
          shipping_option_type_id: typeId,
          estimated_delivery_days: 3,
          carrier: "post",
        })
        const [row] = await service.listShippingOptionTypeDeliveries({
          shipping_option_type_id: typeId,
        })
        expect(Number(row.estimated_delivery_days)).toBe(3)
        expect(row.carrier).toBe("post")

        // update (one row per type)
        await service.updateShippingOptionTypeDeliveries({
          id: row.id,
          estimated_delivery_days: 2,
        })

        // the read-only link exposes it as shipping_option_type.delivery
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "shipping_option_type",
          fields: ["id", "label", "delivery.estimated_delivery_days"],
          filters: { id: typeId },
        })
        expect(Number(data[0].delivery.estimated_delivery_days)).toBe(2)
      })

      it("admin route get/set works under /admin/shipping-templates/:id", async () => {
        const fulfillment = container.resolve(Modules.FULFILLMENT)
        const [type] = await fulfillment.createShippingOptionTypes([
          { label: "تیپاکس", code: `tipax-${Date.now()}`, description: "" },
        ])
        const typeId = type.id

        // initially null
        const g0 = await api.get(
          `/admin/shipping-templates/${typeId}`,
          adminHeaders
        )
        expect(g0.data.delivery).toBeNull()

        // set 2 days (create path)
        const p1 = await api.post(
          `/admin/shipping-templates/${typeId}`,
          { estimated_delivery_days: 2, carrier: "tipax" },
          adminHeaders
        )
        expect(Number(p1.data.delivery.estimated_delivery_days)).toBe(2)

        // update to 5 (upsert/update path)
        await api.post(
          `/admin/shipping-templates/${typeId}`,
          { estimated_delivery_days: 5 },
          adminHeaders
        )
        const g1 = await api.get(
          `/admin/shipping-templates/${typeId}`,
          adminHeaders
        )
        expect(Number(g1.data.delivery.estimated_delivery_days)).toBe(5)

        // list endpoint returns types with their delivery joined (for the UI)
        const list = await api.get(`/admin/shipping-templates`, adminHeaders)
        const found = list.data.shipping_templates.find(
          (t: any) => t.id === typeId
        )
        expect(found).toBeTruthy()
        expect(Number(found.delivery.estimated_delivery_days)).toBe(5)
      })
    })
  },
})
