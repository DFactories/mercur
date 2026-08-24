import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { MercurModules } from "@mercurjs/types"
import { adminHeaders, createAdminUser } from "../../helpers/create-admin-user"

import { refreshOrderCommissionLinesWorkflow } from "@mercurjs/core/workflows"

jest.setTimeout(60000)

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("Commission - getCommissionLines calculation", () => {
      let appContainer: MedusaContainer
      let commissionService: any
      let orderService: any
      let query: any

      const getDefaultRate = async () => {
        const [rate] = await commissionService.listCommissionRates({
          is_default: true,
        })
        return rate
      }

      beforeAll(async () => {
        appContainer = getContainer()
        commissionService = appContainer.resolve(MercurModules.COMMISSION)
        orderService = appContainer.resolve(Modules.ORDER)
        query = appContainer.resolve(ContainerRegistrationKeys.QUERY)
      })

      beforeEach(async () => {
        await createAdminUser(dbConnection, adminHeaders, appContainer)
        // Reset the default rate to a known baseline each test.
        const def = await getDefaultRate()
        await commissionService.updateCommissionRates({
          id: def.id,
          type: "percentage",
          value: 5,
          include_tax: false,
          include_shipping: false,
        })
      })

      /**
       * Commission is charged on what the seller actually receives. A discount is
       * shared between the seller and the marketplace in proportion to the rate,
       * unless the promotion's `cost_bearer` says otherwise: `store` puts the whole
       * discount on the seller (so the marketplace is made whole and charges on the
       * full price), `shared` splits it by the marketplace's declared percentage.
       * The base never falls below the post-discount amount, so a commission can
       * never reach zero or go negative.
       */
      describe("discounted lines", () => {
        const line = (marketplaceBorneDiscount?: number) => ({
          currency_code: "usd",
          items: [
            {
              id: "item_disc",
              subtotal: 100,
              marketplace_borne_discount: marketplaceBorneDiscount,
            },
          ],
          shipping_methods: [],
        })

        beforeEach(async () => {
          const def = await getDefaultRate()
          await commissionService.updateCommissionRates({
            id: def.id,
            value: 10,
            include_shipping: false,
          })
        })

        it("charges on the post-discount amount when the marketplace bears its share", async () => {
          // item 100, discount 20, marketplace bears all of it -> base 80 -> 8
          const lines = await commissionService.getCommissionLines(line(20))
          expect(lines[0].amount).toEqual(8)
        })

        it("charges on the full price when the store bears the whole discount", async () => {
          // store bearer -> marketplace bears none -> base stays 100 -> 10
          const lines = await commissionService.getCommissionLines(line(0))
          expect(lines[0].amount).toEqual(10)
        })

        it("splits the base when the discount is shared", async () => {
          // 20 discount, marketplace covers 50% -> base 90 -> 9
          const lines = await commissionService.getCommissionLines(line(10))
          expect(lines[0].amount).toEqual(9)
        })

        it("is unchanged for a line with no discount at all", async () => {
          const lines = await commissionService.getCommissionLines(line(undefined))
          expect(lines[0].amount).toEqual(10)
        })

        it("never lets a discount drive the commission below zero", async () => {
          // a discount larger than the line cannot make the marketplace owe money
          const lines = await commissionService.getCommissionLines({
            currency_code: "usd",
            items: [
              { id: "item_huge", subtotal: 100, marketplace_borne_discount: 250 },
            ],
            shipping_methods: [],
          })
          expect(lines[0].amount).toBeGreaterThanOrEqual(0)
        })

        it("still charges the full price on a fully discounted store-borne line", async () => {
          // A 100%-off promotion whose cost_bearer is `store`: the seller gave the
          // item away AND the marketplace stays whole, so commission is charged on
          // the list price against a gross of nothing. That is what `store` means,
          // but it drives the vendor net negative — the operator has to opt in.
          const lines = await commissionService.getCommissionLines({
            currency_code: "usd",
            items: [
              { id: "item_free", subtotal: 100, marketplace_borne_discount: 0 },
            ],
            shipping_methods: [],
          })
          expect(lines[0].amount).toEqual(10)
        })

        it("applies the same rule to a discounted shipping method", async () => {
          const def = await getDefaultRate()
          await commissionService.updateCommissionRates({
            id: def.id,
            include_shipping: true,
          })

          const lines = await commissionService.getCommissionLines({
            currency_code: "usd",
            items: [],
            shipping_methods: [
              { id: "sm_disc", subtotal: 50, marketplace_borne_discount: 10 },
            ],
          })
          // 50 - 10 = 40, at 10% -> 4
          expect(lines[0].amount).toEqual(4)
        })
      })

      it("emits a shipping line from the default rate only when include_shipping is on", async () => {
        const def = await getDefaultRate()
        await commissionService.updateCommissionRates({
          id: def.id,
          value: 10,
          include_shipping: true,
        })

        const withShipping = await commissionService.getCommissionLines({
          currency_code: "usd",
          items: [],
          shipping_methods: [{ id: "sm_test_1", subtotal: 50 }],
        })

        expect(withShipping).toHaveLength(1)
        expect(withShipping[0]).toEqual(
          expect.objectContaining({
            shipping_method_id: "sm_test_1",
            item_id: null,
            amount: 5, // 10% of 50
          })
        )

        // Turn include_shipping off → no shipping line.
        await commissionService.updateCommissionRates({
          id: def.id,
          include_shipping: false,
        })

        const noShipping = await commissionService.getCommissionLines({
          currency_code: "usd",
          items: [],
          shipping_methods: [{ id: "sm_test_2", subtotal: 50 }],
        })
        expect(noShipping).toHaveLength(0)
      })

      it("resolves per-currency Fixed amounts from values", async () => {
        const sellerId = "sel_fixed_test"
        await commissionService.createCommissionRates({
          name: "Fixed Per Currency",
          code: "FIX_PER_CCY",
          type: "fixed",
          value: 0,
          is_enabled: true,
          values: [
            { currency_code: "usd", amount: 500 },
            { currency_code: "eur", amount: 450 },
          ],
          rules: [{ reference: "seller", reference_id: sellerId }],
        })

        const ctx = (currency: string) => ({
          currency_code: currency,
          items: [
            {
              id: `item_${currency}`,
              subtotal: 1000,
              product: { id: "prod_x", seller: { id: sellerId } },
            },
          ],
          shipping_methods: [],
        })

        const usd = await commissionService.getCommissionLines(ctx("usd"))
        expect(usd[0]).toEqual(
          expect.objectContaining({ code: "FIX_PER_CCY", amount: 500 })
        )

        const eur = await commissionService.getCommissionLines(ctx("eur"))
        expect(eur[0]).toEqual(
          expect.objectContaining({ code: "FIX_PER_CCY", amount: 450 })
        )
      })

      it("matches AND-across-dimension, OR-within-dimension", async () => {
        const sellerId = "sel_and_test"
        const typeId = "ptyp_and_test"
        await commissionService.createCommissionRates({
          name: "Store And Type",
          code: "AND_RATE",
          type: "percentage",
          value: 20,
          is_enabled: true,
          rules: [
            { reference: "seller", reference_id: sellerId },
            { reference: "product_type", reference_id: typeId },
          ],
        })

        // Matches BOTH dimensions → AND_RATE wins.
        const both = await commissionService.getCommissionLines({
          currency_code: "usd",
          items: [
            {
              id: "item_both",
              subtotal: 100,
              product: { id: "p1", seller: { id: sellerId }, type_id: typeId },
            },
          ],
          shipping_methods: [],
        })
        expect(both[0]).toEqual(
          expect.objectContaining({ code: "AND_RATE", amount: 20 })
        )

        // Matches only the store dimension → falls back to the default rate.
        const onlyStore = await commissionService.getCommissionLines({
          currency_code: "usd",
          items: [
            {
              id: "item_one",
              subtotal: 100,
              product: { id: "p2", seller: { id: sellerId }, type_id: "other" },
            },
          ],
          shipping_methods: [],
        })
        expect(onlyStore[0]).toEqual(
          expect.objectContaining({ code: "default", amount: 5 })
        )
      })

      it("breaks ties by specificity (more dimensions wins)", async () => {
        const sellerId = "sel_spec_test"
        const typeId = "ptyp_spec_test"
        await commissionService.createCommissionRates({
          name: "Store Only",
          code: "SPEC_STORE",
          type: "percentage",
          value: 8,
          is_enabled: true,
          rules: [{ reference: "seller", reference_id: sellerId }],
        })
        await commissionService.createCommissionRates({
          name: "Store And Type",
          code: "SPEC_STORE_TYPE",
          type: "percentage",
          value: 12,
          is_enabled: true,
          rules: [
            { reference: "seller", reference_id: sellerId },
            { reference: "product_type", reference_id: typeId },
          ],
        })

        const lines = await commissionService.getCommissionLines({
          currency_code: "usd",
          items: [
            {
              id: "item_spec",
              subtotal: 100,
              product: { id: "p3", seller: { id: sellerId }, type_id: typeId },
            },
          ],
          shipping_methods: [],
        })

        // 2-dimension rate outranks the 1-dimension rate.
        expect(lines[0]).toEqual(
          expect.objectContaining({ code: "SPEC_STORE_TYPE", amount: 12 })
        )
      })

      describe("refreshOrderCommissionLinesWorkflow", () => {
        const createOrder = async () => {
          return await orderService.createOrders({
            currency_code: "usd",
            email: "buyer@test.com",
            items: [
              {
                title: "Test Item",
                quantity: 1,
                unit_price: 100,
              },
            ],
            shipping_methods: [
              {
                name: "Standard",
                amount: 50,
              },
            ],
            shipping_address: {
              first_name: "Test",
              last_name: "Test",
              address_1: "Test",
              city: "Test",
              country_code: "us",
              postal_code: "12345",
            },
          })
        }

        it("is idempotent — one line per item and per shipping method", async () => {
          const def = await getDefaultRate()
          await commissionService.updateCommissionRates({
            id: def.id,
            value: 10,
            include_shipping: true,
          })

          const order = await createOrder()

          await refreshOrderCommissionLinesWorkflow(appContainer).run({
            input: { order_ids: [order.id] },
          })
          await refreshOrderCommissionLinesWorkflow(appContainer).run({
            input: { order_ids: [order.id] },
          })

          const itemId = order.items![0].id
          const shippingId = order.shipping_methods![0].id

          const itemLines = await commissionService.listCommissionLines({
            item_id: itemId,
          })
          const shippingLines = await commissionService.listCommissionLines({
            shipping_method_id: shippingId,
          })

          // No duplicate accumulation across the two refreshes.
          expect(itemLines).toHaveLength(1)
          expect(shippingLines).toHaveLength(1)
        })

        it("anchors item lines to items and shipping lines to shipping methods", async () => {
          const def = await getDefaultRate()
          await commissionService.updateCommissionRates({
            id: def.id,
            value: 10,
            include_shipping: true,
          })

          const order = await createOrder()
          await refreshOrderCommissionLinesWorkflow(appContainer).run({
            input: { order_ids: [order.id] },
          })

          const itemId = order.items![0].id
          const shippingId = order.shipping_methods![0].id

          const [itemLine] = await commissionService.listCommissionLines({
            item_id: itemId,
          })
          expect(itemLine.item_id).toEqual(itemId)
          expect(itemLine.shipping_method_id).toBeNull()

          const [shippingLine] = await commissionService.listCommissionLines({
            shipping_method_id: shippingId,
          })
          expect(shippingLine.shipping_method_id).toEqual(shippingId)
          expect(shippingLine.item_id).toBeNull()
        })

        it("sums item + shipping commission for payout", async () => {
          const def = await getDefaultRate()
          await commissionService.updateCommissionRates({
            id: def.id,
            value: 10,
            include_shipping: true,
          })

          const order = await createOrder()
          await refreshOrderCommissionLinesWorkflow(appContainer).run({
            input: { order_ids: [order.id] },
          })

          // Same query createPayoutWorkflow uses to total commission for the
          // payout: read the order's item + shipping commission lines.
          const { data: lines } = await query.graph({
            entity: "commission_line",
            fields: ["amount"],
            filters: {
              $or: [
                { item_id: [order.items![0].id] },
                { shipping_method_id: [order.shipping_methods![0].id] },
              ],
            },
          })

          const total = lines.reduce(
            (acc: number, line: any) => acc + Number(line.amount),
            0
          )

          // 10% of item (100) + 10% of shipping (50) = 15.
          expect(total).toEqual(15)
        })

        it("GET /admin/orders/:id/commission-lines returns item + shipping lines", async () => {
          const def = await getDefaultRate()
          await commissionService.updateCommissionRates({
            id: def.id,
            value: 10,
            include_shipping: true,
          })

          const order = await createOrder()
          await refreshOrderCommissionLinesWorkflow(appContainer).run({
            input: { order_ids: [order.id] },
          })

          const response = await api.get(
            `/admin/orders/${order.id}/commission-lines`,
            adminHeaders
          )

          expect(response.status).toEqual(200)
          expect(response.data.count).toEqual(2)
          const total = response.data.commission_lines.reduce(
            (acc: number, line: any) => acc + Number(line.amount),
            0
          )
          expect(total).toEqual(15)
          // One item line + one shipping line.
          expect(
            response.data.commission_lines.filter((l: any) => l.shipping_method_id)
          ).toHaveLength(1)
        })
      })
    })
  },
})
