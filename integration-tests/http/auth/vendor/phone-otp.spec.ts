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

type SellerService = {
  createMembers: (
    data: Array<{ phone?: string | null; email?: string | null }>
  ) => Promise<Array<{ id: string }>>
}

const decodeJwt = (token: string): { actor_id?: string } =>
  JSON.parse(Buffer.from(token.split(".")[1], "base64").toString())

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

      it("login mode errors (before sending a code) for an unregistered phone", async () => {
        const err = await api
          .post("/vendor/auth/phone/request-otp", {
            phone: "09120000091",
            mode: "login",
          })
          .catch(
            (e: { response: { status: number; data: unknown } }) => e
          )

        expect(err.response.status).toEqual(404)
        expect(JSON.stringify(err.response.data)).toContain(
          "PHONE_NOT_REGISTERED"
        )
      })

      it("register mode errors for an already-registered phone", async () => {
        const phone = "09120000092"
        const seller = container.resolve(
          MercurModules.SELLER
        ) as unknown as SellerService
        await seller.createMembers([{ phone }])

        const err = await api
          .post("/vendor/auth/phone/request-otp", {
            phone,
            mode: "register",
          })
          .catch(
            (e: { response: { status: number; data: unknown } }) => e
          )

        expect(JSON.stringify(err.response.data)).toContain(
          "PHONE_ALREADY_REGISTERED"
        )
      })

      it("verify-otp links an existing member that has this phone", async () => {
        const phone = "09120000093"
        const seller = container.resolve(
          MercurModules.SELLER
        ) as unknown as SellerService
        const [member] = await seller.createMembers([{ phone }])

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
        // The minted token's actor is the pre-existing member (bug-1 fix).
        expect(decodeJwt(res.data.token).actor_id).toEqual(member.id)
      })
    })
  },
})
