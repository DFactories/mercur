import { medusaIntegrationTestRunner } from "@medusajs/test-utils"

jest.setTimeout(120000)

type ApiError = { response: { status: number; data: { message?: string } } }

/**
 * Wrong guesses were counted per number only: five per code, ten per number
 * per hour. One client could therefore spend its guesses on any list of
 * numbers and never meet a limit. They are now counted per address as well.
 */
medusaIntegrationTestRunner({
  testSuite: ({ api }) => {
    describe("Dfactories - how many wrong login codes one address may send", () => {
      afterEach(() => {
        delete process.env.OTP_MAX_FAILURES_PER_IP_PER_WINDOW
      })

      const askFor = (phone: string, i: number) =>
        api.post(
          "/vendor/auth/phone/request-otp",
          { phone },
          { headers: { "x-forwarded-for": `198.51.100.${i + 1}` } }
        )

      const guess = (phone: string, address: string) =>
        api
          .post(
            "/vendor/auth/phone/verify-otp",
            { phone, code: "00000" },
            { headers: { "x-forwarded-for": address } }
          )
          .then(
            (res: { status: number }) => ({ status: res.status, message: "" }),
            (e: ApiError) => ({
              status: e.response.status,
              message: e.response.data.message ?? "",
            })
          )

      it("stops an address that guesses at many numbers, and only that address", async () => {
        process.env.OTP_MAX_FAILURES_PER_IP_PER_WINDOW = "3"

        const phones = [0, 1, 2, 3].map((i) => `0912555${1000 + i}`)
        for (const [i, phone] of phones.entries()) {
          await askFor(phone, i)
        }

        const first = []
        for (const phone of phones.slice(0, 3)) {
          first.push(await guess(phone, "203.0.113.7"))
        }
        expect(first.map((r) => r.message)).toEqual(
          Array(3).fill("Invalid verification code.")
        )

        // A number nobody has guessed at yet: refused for the address.
        const fourth = await guess(phones[3], "203.0.113.7")
        expect(fourth.message).toBe(
          "Too many incorrect attempts. Please request a new code."
        )

        // Another address still gets its guess judged.
        const other = await guess(phones[3], "203.0.113.8")
        expect(other.message).toBe("Invalid verification code.")
      })
    })
  },
})
