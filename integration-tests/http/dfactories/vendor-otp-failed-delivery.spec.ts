import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { MercurModules } from "@mercurjs/types"

jest.setTimeout(60000)

type OtpService = {
  listOtpCodes: (filters: {
    identifier: string
    actor_type: string
  }) => Promise<Array<{ id: string }>>
}

type ApiError = { response: { status: number; data: unknown } }

/**
 * Production, 2026-08-28: a vendor requested a login code and got a 500 —
 * `ECONNRESET` mid-TLS-handshake against api.sms.ir. They pressed the button
 * again, as anyone would, and got a *different* error: 400, «Please wait before
 * requesting another code».
 *
 * The code was written to `otp_code` before it was sent, and writing it starts
 * the 60s resend cooldown. So one broken send cost them both the code and the
 * retry, and the second error blamed them for it. The row was still in the
 * table afterwards, unconsumed, for an SMS that had never left the building.
 */
medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    describe("Dfactories - a vendor OTP that was never delivered", () => {
      let container: MedusaContainer
      const phone = "09129990001"

      beforeAll(() => {
        container = getContainer()
      })

      afterEach(() => {
        delete process.env.SMSIR_API_KEY
        delete process.env.SMSIR_BASE_URL
      })

      it("leaves no code behind, so the retry is not refused", async () => {
        // An API key makes the client attempt real delivery instead of its
        // dev-mode no-op; a base URL nothing listens on makes that attempt fail
        // before sms.ir sees it — connection refused here, TLS reset in the
        // incident, the same class of failure either way.
        process.env.SMSIR_API_KEY = "test-key"
        process.env.SMSIR_BASE_URL = "http://127.0.0.1:1/v1"

        const err = await api
          .post("/vendor/auth/phone/request-otp", { phone })
          .catch((e: ApiError) => e)

        expect((err as ApiError).response.status).toEqual(500)

        const otp = container.resolve(MercurModules.OTP) as unknown as OtpService
        const stored = await otp.listOtpCodes({
          identifier: phone,
          actor_type: "member",
        })
        expect(stored).toHaveLength(0)

        // Delivery works again. The retry has to go straight through — if the
        // undelivered code were still on file this is the 400 the vendor saw.
        delete process.env.SMSIR_API_KEY
        const retry = await api.post("/vendor/auth/phone/request-otp", { phone })

        expect(retry.status).toEqual(200)
        expect(retry.data.success).toBe(true)
      })

      it("still refuses a second code once one has actually been delivered", async () => {
        // The cooldown itself is not the bug and must survive the fix.
        const delivered = "09129990002"

        const first = await api.post("/vendor/auth/phone/request-otp", {
          phone: delivered,
        })
        expect(first.status).toEqual(200)

        const err = await api
          .post("/vendor/auth/phone/request-otp", { phone: delivered })
          .catch((e: ApiError) => e)

        expect((err as ApiError).response.status).toEqual(400)
        expect(JSON.stringify((err as ApiError).response.data)).toContain(
          "Please wait"
        )
      })
    })
  },
})
