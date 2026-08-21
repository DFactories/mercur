import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { adminHeaders, createAdminUser } from "../../../helpers/create-admin-user"

jest.setTimeout(50000)

type ChannelState = {
  channel: string
  enabled: boolean
  template_id: string | null
  template_required: boolean
}
type EventConfig = {
  event_key: string
  audience: string
  system: boolean
  channels: ChannelState[]
}

const findEvent = (data: { notification_settings: EventConfig[] }, key: string) =>
  data.notification_settings.find((e) => e.event_key === key)

const findChannel = (event: EventConfig | undefined, channel: string) =>
  event?.channels.find((c) => c.channel === channel)

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("Admin - Notification Settings", () => {
      let container: MedusaContainer

      beforeAll(() => {
        container = getContainer()
      })

      beforeEach(async () => {
        await createAdminUser(dbConnection, adminHeaders, container)
      })

      it("GET returns the effective catalog grouped by event", async () => {
        const res = await api.get("/admin/notification-settings", adminHeaders)

        expect(res.status).toEqual(200)
        expect(Array.isArray(res.data.notification_settings)).toBe(true)
        expect(res.data.notification_settings.length).toBeGreaterThan(0)

        const orderPlaced = findEvent(res.data, "order.placed")
        expect(orderPlaced).toBeDefined()
        expect(orderPlaced?.audience).toEqual("customer")
        expect(findChannel(orderPlaced, "email")).toBeDefined()
        expect(findChannel(orderPlaced, "sms")?.template_required).toBe(true)

        // OTP is a read-only system row
        const otp = findEvent(res.data, "auth.otp")
        expect(otp?.system).toBe(true)
      })

      it("POST gates SMS on a template_id", async () => {
        // Enable SMS without a template_id -> stays effectively disabled.
        const r1 = await api.post(
          "/admin/notification-settings",
          { updates: [{ event_key: "order.placed", channel: "sms", enabled: true }] },
          adminHeaders
        )
        expect(r1.status).toEqual(200)
        expect(findChannel(findEvent(r1.data, "order.placed"), "sms")?.enabled).toBe(
          false
        )

        // Provide a template_id + enable -> now effectively enabled.
        const r2 = await api.post(
          "/admin/notification-settings",
          {
            updates: [
              {
                event_key: "order.placed",
                channel: "sms",
                enabled: true,
                template_id: "123456",
              },
            ],
          },
          adminHeaders
        )
        const sms = findChannel(findEvent(r2.data, "order.placed"), "sms")
        expect(sms?.enabled).toBe(true)
        expect(sms?.template_id).toEqual("123456")
      })

      it("POST persists email channel changes", async () => {
        const res = await api.post(
          "/admin/notification-settings",
          {
            updates: [
              { event_key: "seller.approved", channel: "email", enabled: false },
            ],
          },
          adminHeaders
        )
        expect(
          findChannel(findEvent(res.data, "seller.approved"), "email")?.enabled
        ).toBe(false)
      })

      it("requires admin authentication", async () => {
        const err = await api
          .get("/admin/notification-settings")
          .catch((e: { response: { status: number } }) => e)
        expect(err.response.status).toEqual(401)
      })
    })
  },
})
