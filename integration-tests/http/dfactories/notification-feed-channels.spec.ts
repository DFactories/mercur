import { MedusaContainer } from "@medusajs/framework/types"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"

import { adminHeaders, createAdminUser } from "../../helpers/create-admin-user"

jest.setTimeout(60000)

type CatalogEvent = {
  event_key: string
  category?: string
  priority?: string
  channels: { channel: string; enabled: boolean }[]
}

/**
 * The buyer-side feed channels have to survive the round trip.
 *
 * `customer_feed` and `agent_feed` are declared in three places that can drift
 * apart without anyone noticing: the `NotificationChannel` union, the zod enum
 * on the settings route, and the module's feed-channel list that decides what
 * `defaultFeedEnabled` applies to. A channel present in the union but missing
 * from the enum type-checks perfectly and then 400s the moment an operator
 * flips the toggle — and because the panel writes the whole grid in one
 * request, that single rejected channel takes every other change with it.
 *
 * So this walks the real route rather than the types.
 */
medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("Admin - notification settings accept the buyer-side feed channels", () => {
      let appContainer: MedusaContainer

      beforeAll(() => {
        appContainer = getContainer()
      })

      beforeEach(async () => {
        await createAdminUser(dbConnection, adminHeaders, appContainer)
      })

      const eventsFrom = (data: { notification_settings: CatalogEvent[] }) =>
        data.notification_settings

      const getCatalog = async () =>
        eventsFrom(
          (await api.get("/admin/notification-settings", adminHeaders)).data
        )

      const channelOf = (events: CatalogEvent[], key: string, channel: string) =>
        events.find((e) => e.event_key === key)?.channels.find(
          (c) => c.channel === channel
        )

      it("offers customer_feed on the buyer's own order, on by default", async () => {
        // A feed nobody's first order ever reaches is a panel section that
        // renders empty forever, so the seed catalogue has to carry at least
        // one buyer-facing row.
        const state = channelOf(await getCatalog(), "order.placed", "customer_feed")

        expect(state).toBeDefined()
        expect(state!.enabled).toBe(true)
      })

      it("persists an operator turning customer_feed off and on again", async () => {
        const off = eventsFrom(
          (
            await api.post(
              "/admin/notification-settings",
              {
                updates: [
                  {
                    event_key: "order.placed",
                    channel: "customer_feed",
                    enabled: false,
                  },
                ],
              },
              adminHeaders
            )
          ).data
        )
        expect(channelOf(off, "order.placed", "customer_feed")!.enabled).toBe(
          false
        )

        // Read it back on a fresh request: the response above is computed in
        // the same call that wrote it, so on its own it proves nothing about
        // what landed in the table.
        expect(
          channelOf(await getCatalog(), "order.placed", "customer_feed")!.enabled
        ).toBe(false)

        await api.post(
          "/admin/notification-settings",
          {
            updates: [
              {
                event_key: "order.placed",
                channel: "customer_feed",
                enabled: true,
              },
            ],
          },
          adminHeaders
        )
        expect(
          channelOf(await getCatalog(), "order.placed", "customer_feed")!.enabled
        ).toBe(true)
      })

      it("accepts agent_feed as a channel but only where the catalog offers it", async () => {
        // Two separate gates, and this pins both: the validator's enum must
        // KNOW the channel (no 400), while the route's allow-list decides where
        // it may be configured. `order.placed` is a buyer event, so an
        // agent-feed row for it is silently dropped rather than written — which
        // is what keeps the settings table free of rows nothing reads.
        const response = await api.post(
          "/admin/notification-settings",
          {
            updates: [
              {
                event_key: "order.placed",
                channel: "agent_feed",
                enabled: true,
              },
            ],
          },
          adminHeaders
        )

        expect(response.status).toEqual(200)
        expect(
          channelOf(eventsFrom(response.data), "order.placed", "agent_feed")
        ).toBeUndefined()
      })

      it("rejects a channel that is not a real one", async () => {
        // The other half of the enum's job: a typo fails loudly here rather
        // than writing a row nothing will ever read.
        await expect(
          api.post(
            "/admin/notification-settings",
            {
              updates: [
                {
                  event_key: "order.placed",
                  channel: "customer-feed",
                  enabled: true,
                },
              ],
            },
            adminHeaders
          )
        ).rejects.toMatchObject({ response: { status: 400 } })
      })

      it("returns a category and a priority for every event", async () => {
        // The feed groups, filters and badges on these two. An event that
        // omits them falls back to system/info, which is survivable — a ROUTE
        // that omits the fields is not: the panel then has nothing to group by
        // and every row lands in one bucket.
        const events = await getCatalog()

        expect(events.length).toBeGreaterThan(0)
        for (const event of events) {
          expect(typeof event.category).toBe("string")
          expect(["action_required", "info"]).toContain(event.priority)
        }
      })

      it("marks a suspended store as needing action", async () => {
        // The one seed event whose entire point is that somebody must act.
        const suspended = (await getCatalog()).find(
          (e) => e.event_key === "seller.suspended"
        )

        expect(suspended?.priority).toEqual("action_required")
        expect(suspended?.category).toEqual("account")
      })
    })
  },
})
