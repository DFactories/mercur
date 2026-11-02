import { beforeEach, describe, expect, it, vi } from "vitest"

const sendVerify = vi.fn()

vi.mock("../../providers/smsir/client", () => ({
  createSmsIrClient: () => ({ sendVerify }),
}))

import { createRequestOtpHandler, createVerifyOtpHandler } from "./phone-otp"
import { iranMobileVariants } from "./phone"

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

/**
 * A customer row a phone sign-in lands on is an account from then on.
 *
 * The verify route reuses whatever customer already holds the number, and that
 * can be a guest row (`has_account: false`, from a checkout, an agent or an
 * admin). Linking it without the flag left an account the rest of the backend
 * reads as a guest. Owner decision 2026-11-02.
 */
describe("customer OTP sign-in and has_account", () => {
  const PHONE = "09121234567"

  type Row = { id: string; has_account: boolean; email?: string }

  // `onPhone` are the rows holding PHONE; `others` only answer email lookups.
  const setup = (onPhone: Row | Row[] = [], others: Row[] = []) => {
    const phoneRows = ([] as Row[]).concat(onPhone)
    const customers = {
      listCustomers: vi.fn(
        async (filters: {
          phone?: string[]
          email?: string
          has_account?: boolean
        }) =>
          filters.phone
            ? phoneRows
            : [...phoneRows, ...others].filter(
                (c) =>
                  c.email === filters.email &&
                  c.has_account === filters.has_account
              )
      ),
      createCustomers: vi.fn(async () => [
        { id: "cus_new", has_account: true },
      ]),
      updateCustomers: vi.fn(async () => ({})),
    }
    const authIdentity = {
      id: "authid_1",
      app_metadata: {} as Record<string, unknown>,
    }
    const auth = {
      listProviderIdentities: vi.fn(async () => [
        { auth_identity_id: authIdentity.id },
      ]),
      retrieveAuthIdentity: vi.fn(async () => authIdentity),
      createAuthIdentities: vi.fn(),
      updateAuthIdentities: vi.fn(
        async (data: { app_metadata: Record<string, unknown> }) => {
          authIdentity.app_metadata = data.app_metadata
        }
      ),
    }
    const services: Record<string, unknown> = {
      otp: { verifyOtp: vi.fn(async () => undefined) },
      customer: customers,
      auth,
      configModule: {
        projectConfig: { http: { jwtSecret: "secret", jwtExpiresIn: "1d" } },
      },
    }
    const scope = {
      resolve: (key: string) => {
        if (key in services) return services[key]
        throw new Error(`unexpected resolve(${key})`)
      },
    }
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    }

    return {
      customers,
      auth,
      linkedCustomerId: () => authIdentity.app_metadata.customer_id,
      run: () =>
        createVerifyOtpHandler("customer")(
          { body: { phone: PHONE, code: "12345" }, scope } as never,
          res as never
        ),
    }
  }

  it("marks a reused guest row as an account, before the link, once", async () => {
    const { run, customers, auth, linkedCustomerId } = setup({
      id: "cus_guest",
      has_account: false,
    })
    await run()
    // A second sign-in finds the identity linked and writes nothing.
    await run()

    expect(customers.updateCustomers).toHaveBeenCalledTimes(1)
    expect(customers.updateCustomers).toHaveBeenCalledWith("cus_guest", {
      has_account: true,
    })
    expect(customers.updateCustomers.mock.invocationCallOrder[0]).toBeLessThan(
      auth.updateAuthIdentities.mock.invocationCallOrder[0]
    )
    expect(auth.updateAuthIdentities).toHaveBeenCalledTimes(1)
    expect(linkedCustomerId()).toBe("cus_guest")
    expect(customers.createCustomers).not.toHaveBeenCalled()
  })

  it("does not update a reused row that is already an account", async () => {
    const { run, customers, linkedCustomerId } = setup({
      id: "cus_account",
      has_account: true,
    })
    await run()

    expect(customers.updateCustomers).not.toHaveBeenCalled()
    expect(customers.createCustomers).not.toHaveBeenCalled()
    expect(linkedCustomerId()).toBe("cus_account")
  })

  it("creates a phone-only account when no row holds the number", async () => {
    const { run, customers, linkedCustomerId } = setup()
    await run()

    expect(customers.createCustomers).toHaveBeenCalledWith([
      { phone: PHONE, has_account: true },
    ])
    expect(customers.updateCustomers).not.toHaveBeenCalled()
    expect(linkedCustomerId()).toBe("cus_new")
  })

  it("looks the number up in every format, oldest row first", async () => {
    const { run, customers } = setup()
    await run()

    expect(customers.listCustomers).toHaveBeenCalledWith(
      { phone: iranMobileVariants(PHONE) },
      { order: { created_at: "ASC" } }
    )
  })

  it("links the account row when a guest row shares the number", async () => {
    const { run, customers, linkedCustomerId } = setup([
      { id: "cus_guest", has_account: false },
      { id: "cus_account", has_account: true },
    ])
    await run()

    expect(linkedCustomerId()).toBe("cus_account")
    expect(customers.updateCustomers).not.toHaveBeenCalled()
  })

  it("links a guest row without the flag when its email already has an account", async () => {
    // Medusa's unique (email, has_account) index would refuse the flip on
    // every sign-in; the row is linked as it was before the flag existed.
    const { run, customers, linkedCustomerId } = setup(
      { id: "cus_guest", has_account: false, email: "a@example.com" },
      [{ id: "cus_email", has_account: true, email: "a@example.com" }]
    )
    await run()

    expect(customers.listCustomers).toHaveBeenCalledWith({
      email: "a@example.com",
      has_account: true,
    })
    expect(customers.updateCustomers).not.toHaveBeenCalled()
    expect(linkedCustomerId()).toBe("cus_guest")
  })

  it("flips a guest row with an email no account uses", async () => {
    const { run, customers, linkedCustomerId } = setup({
      id: "cus_guest",
      has_account: false,
      email: "a@example.com",
    })
    await run()

    expect(customers.updateCustomers).toHaveBeenCalledWith("cus_guest", {
      has_account: true,
    })
    expect(linkedCustomerId()).toBe("cus_guest")
  })

  it("does not link the identity when the flag cannot be written", async () => {
    // A failed write must leave the identity unlinked so the next sign-in
    // retries it; the early return would otherwise skip it for good.
    const { run, customers, auth } = setup({
      id: "cus_guest",
      has_account: false,
    })
    customers.updateCustomers.mockRejectedValueOnce(new Error("db down"))

    await expect(run()).rejects.toThrow("db down")
    expect(auth.updateAuthIdentities).not.toHaveBeenCalled()
  })
})
