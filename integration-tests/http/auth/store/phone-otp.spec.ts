import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import {
  adminHeaders,
  createAdminUser,
  generatePublishableKey,
  generateStoreHeaders,
} from "../../../helpers/create-admin-user"
import { MercurModules } from "@mercurjs/types"

jest.setTimeout(50000)

type OtpService = {
  requestOtp: (input: {
    identifier: string
    actor_type: string
  }) => Promise<{ code: string }>
}

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("Store - Phone (OTP) auth", () => {
      let container: MedusaContainer
      let storeHeaders: Record<string, Record<string, string>>

      beforeAll(async () => {
        container = getContainer()
        await createAdminUser(dbConnection, adminHeaders, container)
      })

      beforeEach(async () => {
        const publishableKey = await generatePublishableKey(container)
        storeHeaders = generateStoreHeaders({ publishableKey })
      })

      it("verify-otp creates and links a phone-only customer, returning a token", async () => {
        const phone = "09120000010"
        const otp = container.resolve(MercurModules.OTP) as unknown as OtpService
        const { code } = await otp.requestOtp({
          identifier: phone,
          actor_type: "customer",
        })

        const res = await api.post(
          "/store/auth/phone/verify-otp",
          { phone, code },
          storeHeaders
        )

        expect(res.status).toEqual(200)
        expect(typeof res.data.token).toBe("string")

        const customerService = container.resolve(Modules.CUSTOMER)
        const customers = await customerService.listCustomers({ phone })
        expect(customers.length).toEqual(1)
        expect(customers[0].has_account).toBe(true)
        // phone-only: no email required
        expect(customers[0].email).toBeFalsy()
      })

      it("verify-otp is idempotent for a returning customer (no duplicate)", async () => {
        const phone = "09120000011"
        const otp = container.resolve(MercurModules.OTP) as unknown as OtpService

        const first = await otp.requestOtp({
          identifier: phone,
          actor_type: "customer",
        })
        await api.post(
          "/store/auth/phone/verify-otp",
          { phone, code: first.code },
          storeHeaders
        )

        const second = await otp.requestOtp({
          identifier: phone,
          actor_type: "customer",
        })
        await api.post(
          "/store/auth/phone/verify-otp",
          { phone, code: second.code },
          storeHeaders
        )

        const customerService = container.resolve(Modules.CUSTOMER)
        const customers = await customerService.listCustomers({ phone })
        expect(customers.length).toEqual(1)
      })
    })
  },
})
