import { medusaIntegrationTestRunner } from "@medusajs/test-utils"

jest.setTimeout(120000)

type ApiError = { response: { status: number; data: { message?: string } } }

/**
 * The only limit on sending a login code was one code per number per cooldown.
 * Nothing counted how many NUMBERS were asked for, so one client could have the
 * platform text any list of strangers, one SMS each, for as long as it liked:
 * the SMS bill is ours and so is the sender's reputation.
 */
medusaIntegrationTestRunner({
  testSuite: ({ api }) => {
    describe("Dfactories - how many login codes may be sent", () => {
      afterEach(() => {
        delete process.env.OTP_MAX_SENDS_PER_HOUR
      })

      const send = (phone: string, address: string) =>
        api
          .post(
            "/vendor/auth/phone/request-otp",
            { phone },
            { headers: { "x-forwarded-for": address } }
          )
          .then(
            (res: { status: number }) => res.status,
            (e: ApiError) => e.response.status
          )

      it("stops one address after ten numbers in an hour, and only that address", async () => {
        const statuses: number[] = []
        for (let i = 0; i < 12; i++) {
          statuses.push(await send(`0912777${1000 + i}`, "203.0.113.7"))
        }

        expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200))
        expect(statuses.slice(10)).toEqual([400, 400])

        expect(await send("09127772000", "203.0.113.8")).toBe(200)
      })

      it("stops everyone once the platform's hourly total is reached", async () => {
        process.env.OTP_MAX_SENDS_PER_HOUR = "3"

        const statuses: number[] = []
        for (let i = 0; i < 5; i++) {
          statuses.push(await send(`0912666${1000 + i}`, `198.51.100.${i + 1}`))
        }

        expect(statuses).toEqual([200, 200, 200, 400, 400])
      })
    })
  },
})
