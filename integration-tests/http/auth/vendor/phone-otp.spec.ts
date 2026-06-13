import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { MercurModules } from "@mercurjs/types"

jest.setTimeout(50000)

type OtpService = {
  requestOtp: (input: {
    identifier: string
    actor_type: string
  }) => Promise<{ code: string }>
}

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    describe("Vendor - Phone (OTP) auth", () => {
      let container: MedusaContainer

      beforeAll(() => {
        container = getContainer()
      })

      it("request-otp returns 200 (sms.ir client no-ops without an API key)", async () => {
        const res = await api.post("/vendor/auth/phone/request-otp", {
          phone: "09120000001",
        })

        expect(res.status).toEqual(200)
        expect(res.data.success).toBe(true)
      })

      it("verify-otp returns a session token for a valid code", async () => {
        const phone = "09120000002"
        const otp = container.resolve(MercurModules.OTP) as unknown as OtpService
        const { code } = await otp.requestOtp({
          identifier: phone,
          actor_type: "member",
        })

        const res = await api.post("/vendor/auth/phone/verify-otp", {
          phone,
          code,
        })

        expect(res.status).toEqual(200)
        expect(typeof res.data.token).toBe("string")
        expect(res.data.token.length).toBeGreaterThan(10)
      })

      it("verify-otp rejects an invalid code with 401", async () => {
        const phone = "09120000003"
        const otp = container.resolve(MercurModules.OTP) as unknown as OtpService
        await otp.requestOtp({ identifier: phone, actor_type: "member" })

        const err = await api
          .post("/vendor/auth/phone/verify-otp", { phone, code: "000000" })
          .catch((e: { response: { status: number } }) => e)

        expect(err.response.status).toEqual(401)
      })

      it("verify-otp rejects when no code was requested", async () => {
        const err = await api
          .post("/vendor/auth/phone/verify-otp", {
            phone: "09120000004",
            code: "12345",
          })
          .catch((e: { response: { status: number } }) => e)

        expect(err.response.status).toEqual(401)
      })
    })
  },
})
