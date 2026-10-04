import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"
import jwt from "jsonwebtoken"

import {
  adminHeaders,
  createAdminUser,
} from "../../helpers/create-admin-user"
import { createSellerUser } from "../../helpers/create-seller-user"

/**
 * REGRESSION — the admin routes this package replaces were open to every role.
 *
 * `disableMedusaMiddlewares` empties Medusa's middleware arrays for the admin
 * groups this package re-implements (products, orders, categories, …) so its
 * own can take over. Medusa's policy guards live in those arrays, so they went
 * too, and nothing put them back: up to core `2.3.1-dfactories.33` an admin
 * holding only `seller:read` could list every order, edit any product, change
 * which stores may sell it, and create categories.
 */

jest.setTimeout(120000)

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("Admin - core routes this package replaces", () => {
      let appContainer: MedusaContainer
      let productId: string
      let sellerId: string

      const restrictedAdmin = async (email: string, keys: string[]) => {
        const userModule: any = appContainer.resolve(Modules.USER)
        const rbac: any = appContainer.resolve("rbac")
        const user = await userModule.createUsers({ email })
        const role = await rbac.createRbacRoles({ name: `Role ${email}` })
        const policies = await rbac.listRbacPolicies({})
        for (const key of keys) {
          const [resource, operation] = key.split(":")
          const policy = policies.find(
            (p: { resource: string; operation: string }) =>
              p.resource === resource && p.operation === operation
          )
          expect(policy).toBeDefined()
          await rbac.createRbacRolePolicies({ role_id: role.id, policy_id: policy.id })
        }
        const { jwtSecret, jwtOptions } = appContainer.resolve(
          ContainerRegistrationKeys.CONFIG_MODULE
        ).projectConfig.http
        const token = jwt.sign(
          {
            actor_id: user.id,
            actor_type: "user",
            auth_identity_id: `test_ai_${user.id}`,
            app_metadata: { roles: [role.id] },
          },
          jwtSecret as string,
          { expiresIn: "1d", ...(jwtOptions ?? {}) }
        )
        return { headers: { authorization: `Bearer ${token}` } }
      }

      const statusOf = (call: () => Promise<{ status: number }>) =>
        call()
          .then((r) => r.status)
          .catch((e: { response?: { status: number } }) => e.response?.status)

      beforeEach(async () => {
        appContainer = getContainer()
        await createAdminUser(dbConnection, adminHeaders, appContainer)
        const { seller } = await createSellerUser(appContainer, {
          email: "guard@test.com",
          name: "Guard Store",
        })
        sellerId = (seller as { id: string }).id
        const { result } = await createProductsWorkflow(appContainer).run({
          input: {
            products: [
              {
                title: "Guarded",
                status: "published",
                options: [{ title: "Size", values: ["One"] }],
                variants: [
                  {
                    title: "One",
                    options: { Size: "One" },
                    prices: [{ currency_code: "usd", amount: 10 }],
                  },
                ],
              },
            ],
          } as never,
        })
        productId = (result[0] as unknown as { id: string }).id
      })

      it("refuses every replaced group to an admin without its grant", async () => {
        const operator = await restrictedAdmin("seller-only@test.com", ["seller:read"])

        const calls: [string, () => Promise<{ status: number }>][] = [
          ["GET /admin/orders", () => api.get(`/admin/orders`, operator)],
          ["GET /admin/products", () => api.get(`/admin/products`, operator)],
          ["GET /admin/products/:id", () => api.get(`/admin/products/${productId}`, operator)],
          ["POST /admin/products/:id", () => api.post(`/admin/products/${productId}`, { subtitle: "x" }, operator)],
          ["POST /admin/products/:id/sellers", () => api.post(`/admin/products/${productId}/sellers`, { add: [sellerId] }, operator)],
          ["GET /admin/product-variants", () => api.get(`/admin/product-variants`, operator)],
          ["GET /admin/product-categories", () => api.get(`/admin/product-categories`, operator)],
          ["POST /admin/product-categories", () => api.post(`/admin/product-categories`, { name: "x" }, operator)],
          ["GET /admin/collections", () => api.get(`/admin/collections`, operator)],
          ["POST /admin/collections", () => api.post(`/admin/collections`, { title: "x" }, operator)],
          ["GET /admin/promotions", () => api.get(`/admin/promotions`, operator)],
          ["GET /admin/campaigns", () => api.get(`/admin/campaigns`, operator)],
          ["GET /admin/price-lists", () => api.get(`/admin/price-lists`, operator)],
          ["GET /admin/customer-groups", () => api.get(`/admin/customer-groups`, operator)],
          ["GET /admin/stock-locations", () => api.get(`/admin/stock-locations`, operator)],
          ["GET /admin/reservations", () => api.get(`/admin/reservations`, operator)],
          ["GET /admin/inventory-items", () => api.get(`/admin/inventory-items`, operator)],
          ["GET /admin/shipping-options", () => api.get(`/admin/shipping-options`, operator)],
          ["GET /admin/shipping-profiles", () => api.get(`/admin/shipping-profiles`, operator)],
        ]

        const open: string[] = []
        for (const [label, call] of calls) {
          if ((await statusOf(call)) !== 403) {
            open.push(label)
          }
        }
        expect(open).toEqual([])
      })

      it("grants each operation separately", async () => {
        const reader = await restrictedAdmin("product-reader@test.com", ["product:read"])

        expect(await statusOf(() => api.get(`/admin/products`, reader))).toEqual(200)
        expect(await statusOf(() => api.get(`/admin/products/${productId}`, reader))).toEqual(200)
        expect(
          await statusOf(() => api.post(`/admin/products/${productId}`, { subtitle: "x" }, reader))
        ).toEqual(403)
        expect(await statusOf(() => api.get(`/admin/orders`, reader))).toEqual(403)
      })

      it("leaves a full admin's access unchanged", async () => {
        expect(await statusOf(() => api.get(`/admin/orders`, adminHeaders))).toEqual(200)
        expect(
          await statusOf(() => api.post(`/admin/products/${productId}`, { subtitle: "x" }, adminHeaders))
        ).toEqual(200)
      })
    })
  },
})
