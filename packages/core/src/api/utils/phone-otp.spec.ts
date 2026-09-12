import { beforeEach, describe, expect, it, vi } from "vitest"

const sendVerify = vi.fn()

vi.mock("../../providers/smsir/client", () => ({
  createSmsIrClient: () => ({ sendVerify }),
}))

import { createRequestOtpHandler, createVerifyOtpHandler } from "./phone-otp"

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

/**
 * The two clocks reach the client.
 *
 * A client that hardcodes the code's lifetime is wrong the first time an
 * operator changes `OTP_TTL_SECONDS` — and wrong in the direction that promises
 * more time than the code has. The storefront showing ONLY the 60s resend
 * cooldown is what produced «کد otp منقضی نمی‌شود»: the code lives 120s, so it
 * was still valid a full minute after the visible counter hit zero.
 */
describe("the request response carries both clocks", () => {
  const otp = {
    requestOtp: vi.fn(),
    discardOtp: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    otp.requestOtp.mockResolvedValue({ id: "otp_1", code: "12345" })
    sendVerify.mockResolvedValue(undefined)
  })

  it("reports the code's validity AND the resend cooldown", async () => {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    }
    const req = {
      body: { phone: "09120000000" },
      scope: { resolve: () => otp },
    }

    await createRequestOtpHandler("customer")(req as never, res as never)

    const payload = res.json.mock.calls[0][0]
    expect(payload.success).toBe(true)
    // Defaults; both are env-configurable, which is exactly why they are sent
    // rather than left for a client to guess.
    //
    // EQUAL by default. Two different numbers on one screen is what produced
    // «کد otp منقضی نمی‌شود»: a 60-second resend counter read as the code's
    // lifetime, beside a code that still worked at 90. Equal, the single
    // counter every login shows is true of both — "ask again" and "this code is
    // dead" are the same instant.
    expect(payload.expires_in).toBe(120)
    expect(payload.resend_in).toBe(120)
    // The code's life must never be reported as SHORTER than the cooldown, or a
    // user is told to wait for a resend they cannot yet ask for while holding a
    // code they are told is dead.
    expect(payload.expires_in).toBeGreaterThanOrEqual(payload.resend_in)
  })
})

/**
 * A malformed body is a 400 with a code, not a 500 with an English sentence.
 *
 * The handlers used to call `Schema.parse()`, whose `ZodError` Medusa's error
 * handler does not recognise — so `{"phone":"0912"}` came back as HTTP 500
 * carrying "Validation error: Too small: expected string to have >=8
 * characters". Wrong status, and copy no Persian panel can translate. Reachable
 * without trying: the vendor login form never length-checks the code, so a
 * mistyped 3-digit code produced a 500. Measured against production on
 * 2026-09-12, minutes after the release.
 */
describe("a malformed OTP body", () => {
  const invoke = (handler: ReturnType<typeof createRequestOtpHandler>, body: unknown) => {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    }
    const req = { body, scope: { resolve: () => ({}) } }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return handler(req as any, res as any)
  }

  it("refuses a too-short phone as INVALID_PHONE", async () => {
    await expect(
      invoke(createRequestOtpHandler("member"), { phone: "0912" })
    ).rejects.toThrow("INVALID_PHONE")
  })

  it("refuses a missing body as INVALID_PHONE", async () => {
    await expect(
      invoke(createRequestOtpHandler("member"), {})
    ).rejects.toThrow("INVALID_PHONE")
  })

  it("names the CODE when that is the field that failed", async () => {
    await expect(
      invoke(createVerifyOtpHandler("member"), {
        phone: "09121234567",
        code: "12",
      })
    ).rejects.toThrow("INVALID_CODE")
  })

  it("still says INVALID_PHONE when both are wrong", async () => {
    await expect(
      invoke(createVerifyOtpHandler("member"), { phone: "x", code: "12" })
    ).rejects.toThrow("INVALID_PHONE")
  })
})
