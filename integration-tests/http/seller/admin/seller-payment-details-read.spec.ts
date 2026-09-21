import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import jwt from "jsonwebtoken"

import {
  adminHeaders,
  createAdminUser,
} from "../../../helpers/create-admin-user"
import { createSellerUser } from "../../../helpers/create-seller-user"

jest.setTimeout(120000)

/**
 * `seller:read` must not carry a producer's bank details with it.
 *
 * `seller_payment_details` exists as a resource of its own precisely because
 * "may fill in a store's profile" and "may change where its money goes" are
 * different trusts — but the split was only ever applied to writes. The admin
 * seller routes select `*payment_details` by default, so any role that could
 * open the store list could read every producer's IBAN.
 *
 * Reported against a live deployment where the onboarding operator role holds
 * `seller:read` and nothing about money.
 */
const IBAN = "IR820540102680020817909002"

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("Admin - reading a seller's payment details", () => {
      let appContainer: MedusaContainer
      let sellerId: string

      /** An admin whose role grants exactly `keys`, with a matching token. */
      const restrictedAdmin = async (email: string, keys: string[]) => {
        const userModule: any = appContainer.resolve(Modules.USER)
        const rbac: any = appContainer.resolve("rbac")

        const user = await userModule.createUsers({
          email,
          first_name: "Restricted",
          last_name: "Admin",
        })

        const role = await rbac.createRbacRoles({ name: `Role ${email}` })

        // Looked up, never created: `syncRegisteredPolicies` mirrors every
        // `definePolicies` entry into the table on boot, so a policy invented
        // here would be a second row with the same key and would prove
        // nothing about the real one.
        const policies = await rbac.listRbacPolicies({})
        for (const key of keys) {
          const [resource, operation] = key.split(":")
          const policy = policies.find(
            (p: { resource: string; operation: string }) =>
              p.resource === resource && p.operation === operation
          )
          expect(policy).toBeDefined()
          await rbac.createRbacRolePolicies({
            role_id: role.id,
            policy_id: policy.id,
          })
        }

        const config = appContainer.resolve(
          ContainerRegistrationKeys.CONFIG_MODULE
        )
        const { jwtSecret, jwtOptions } = config.projectConfig.http
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

      beforeEach(async () => {
        appContainer = getContainer()
        await createAdminUser(dbConnection, adminHeaders, appContainer)

        const { seller } = await createSellerUser(appContainer, {
          email: "payee@test.com",
          name: "Payee Store",
        })
        sellerId = seller.id

        const sellerModule: any = appContainer.resolve("seller")
        await sellerModule.createPaymentDetails({
          seller_id: sellerId,
          holder_name: "The Producer",
          iban: IBAN,
          account_number: "0201234567001",
        })
      })

      it("gives them to a super admin", async () => {
        // Without this the assertions below would pass against a route that
        // never returns payment details to anybody.
        const res = await api.get(`/admin/sellers/${sellerId}`, adminHeaders)

        expect(res.status).toBe(200)
        expect(res.data.seller.payment_details?.iban).toBe(IBAN)
      })

      it("withholds them from a role that only holds seller:read", async () => {
        const operator = await restrictedAdmin("operator@test.com", [
          "seller:read",
        ])

        const res = await api.get(`/admin/sellers/${sellerId}`, operator)

        expect(res.status).toBe(200)
        expect(res.data.seller.id).toBe(sellerId)
        expect(res.data.seller.payment_details).toBeFalsy()
      })

      it("withholds them from the list as well as the detail route", async () => {
        const operator = await restrictedAdmin("lister@test.com", [
          "seller:read",
        ])

        const res = await api.get("/admin/sellers", operator)

        expect(res.status).toBe(200)
        expect(res.data.sellers.length).toBeGreaterThan(0)
        for (const seller of res.data.sellers) {
          expect(seller.payment_details).toBeFalsy()
        }
      })

      it("withholds them when they are asked for by name", async () => {
        // `+payment_details` is merged into the query config, so filtering the
        // defaults alone would leave the field one query parameter away.
        const operator = await restrictedAdmin("asker@test.com", [
          "seller:read",
        ])

        const res = await api.get(
          `/admin/sellers/${sellerId}?fields=%2Bpayment_details.iban`,
          operator
        )

        expect(res.status).toBe(200)
        expect(res.data.seller.payment_details).toBeFalsy()
      })

      it("gives them to a role that holds seller_payment_details:read", async () => {
        const finance = await restrictedAdmin("finance@test.com", [
          "seller:read",
          "seller_payment_details:read",
        ])

        const res = await api.get(`/admin/sellers/${sellerId}`, finance)

        expect(res.status).toBe(200)
        expect(res.data.seller.payment_details?.iban).toBe(IBAN)
      })
    })
  },
})
