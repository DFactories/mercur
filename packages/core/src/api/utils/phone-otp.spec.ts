import { beforeEach, describe, expect, it, vi } from "vitest"

const sendVerify = vi.fn()

vi.mock("../../providers/smsir/client", () => ({
  createSmsIrClient: () => ({ sendVerify }),
}))

import { createRequestOtpHandler } from "./phone-otp"

/**
 * The undelivered-code boundary.
 *
 * Storing a code starts the 60s resend cooldown, so a code that is stored but
 * never delivered costs the user both the code and the retry: their (correct)
 * second attempt comes back "Please wait before requesting another code" while
 * no SMS ever arrived. Seen in production as an `ECONNRESET` mid-TLS-handshake
 * against api.sms.ir, followed by a 400 on the retry.
 */
describe("createRequestOtpHandler", () => {
  const otp = {
    requestOtp: vi.fn(),
    discardOtp: vi.fn(),
  }

  const invoke = () => {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    }
    const req = {
      body: { phone: "09121234567" },
      scope: { resolve: () => otp },
    }
    return {
      res,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      run: () => createRequestOtpHandler("member")(req as any, res as any),
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    otp.requestOtp.mockResolvedValue({
      id: "otp_1",
      code: "12345",
      expires_at: new Date(),
    })
  })

  it("keeps the code once it has been delivered", async () => {
    sendVerify.mockResolvedValue({ status: "sent" })

    const { res, run } = invoke()
    await run()

    expect(otp.discardOtp).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it("discards the code when delivery fails, so the retry is not blocked", async () => {
    sendVerify.mockRejectedValue(new Error("ECONNRESET"))

    const { run } = invoke()
    await expect(run()).rejects.toThrow("ECONNRESET")

    expect(otp.discardOtp).toHaveBeenCalledWith("otp_1")
  })
})
