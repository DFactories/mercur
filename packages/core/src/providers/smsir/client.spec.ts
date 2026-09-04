import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SmsIrClient } from "./client"

/**
 * The retry boundary.
 *
 * A DNS/TCP/TLS failure rejects `fetch` before sms.ir ever saw the request, so
 * nothing was queued and one more attempt cannot duplicate a message. Anything
 * that came back WITH a response was decided by sms.ir — a rejected template, a
 * bad key, no credit — and repeating it only spends time.
 */
describe("SmsIrClient.sendVerify", () => {
  const client = new SmsIrClient({
    apiKey: "test-key",
    baseUrl: "https://api.sms.ir/v1",
  })
  const ok = () =>
    ({ ok: true, status: 200, json: async () => ({ status: 1, data: {} }) }) as
      unknown as Response

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("retries once when the connection never reached sms.ir", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("socket disconnected"), { code: "ECONNRESET" })
      )
      .mockResolvedValueOnce(ok())
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      client.sendVerify("09121234567", 1, [{ name: "CODE", value: "12345" }])
    ).resolves.toMatchObject({ status: "sent" })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("gives up when the retry fails too", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNRESET"))
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      client.sendVerify("09121234567", 1, [{ name: "CODE", value: "12345" }])
    ).rejects.toThrow("ECONNRESET")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("does not retry a request sms.ir answered", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 20, message: "template not approved" }),
    } as unknown as Response)
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      client.sendVerify("09121234567", 1, [{ name: "CODE", value: "12345" }])
    ).rejects.toThrow("template not approved")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

/**
 * The free-text boundary.
 *
 * `sendBulk` is the only path that can put arbitrary text on somebody's phone.
 * Everything automated goes through an approved template, so what these tests
 * guard is that the free-text path stays deliberate: it needs its own sender
 * line, it refuses to fire at nobody, and it never silently becomes the way an
 * ordinary notification gets delivered.
 */
describe("SmsIrClient.sendBulk", () => {
  const ok = () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({ status: 1, data: { packId: "pack_1" } }),
    }) as unknown as Response

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.SMSIR_LINE_NUMBER
  })

  const client = () =>
    new SmsIrClient({ apiKey: "test-key", baseUrl: "https://api.sms.ir/v1" })

  it("posts the free text to /send/bulk with its own line number", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok())
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      client().sendBulk(["09121234567"], "سلام", 30007)
    ).resolves.toMatchObject({ status: "sent" })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.sms.ir/v1/send/bulk")
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      lineNumber: 30007,
      messageText: "سلام",
      mobiles: ["09121234567"],
    })
  })

  /** `GET /v1/line` as sms.ir answers it: a flat array of line numbers. */
  const lines = (data: number[]) =>
    ({
      ok: true,
      status: 200,
      json: async () => ({ status: 1, data }),
    }) as unknown as Response

  it("uses the account's only line when nobody chose one", async () => {
    // The common case, and the one that used to fail: an account with a single
    // line has no decision to make, and demanding SMSIR_LINE_NUMBER for it
    // turned a working account into a broken feature.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(lines([30002108000668]))
      .mockResolvedValueOnce(ok())
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      client().sendBulk(["09121234567"], "سلام")
    ).resolves.toMatchObject({ status: "sent" })

    const [, init] = fetchMock.mock.calls[1]
    expect(JSON.parse((init as RequestInit).body as string).lineNumber).toBe(
      30002108000668
    )
  })

  it("refuses to guess when the account has more than one line", async () => {
    // Borrowing the OTP line for operator traffic is how a service line gets
    // suspended. With a real choice to make, sending from the wrong number is
    // worse than not sending — and the message names the candidates.
    const fetchMock = vi.fn().mockResolvedValue(lines([30007, 30008]))
    vi.stubGlobal("fetch", fetchMock)

    await expect(client().sendBulk(["09121234567"], "سلام")).rejects.toThrow(
      /this account has 2 \(30007, 30008\)/
    )
    // The listing happened; the send did not.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("says to buy a line when the account has none", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(lines([])))

    await expect(client().sendBulk(["09121234567"], "سلام")).rejects.toThrow(
      /this account has none/
    )
  })

  it("prefers the operator's choice over everything else", async () => {
    // Explicit beats env beats discovery: the operator picked this line for
    // this send, in front of the recipient count.
    process.env.SMSIR_LINE_NUMBER = "30007"
    const fetchMock = vi.fn().mockResolvedValue(ok())
    vi.stubGlobal("fetch", fetchMock)

    await client().sendBulk(["09121234567"], "سلام", 300028287181)

    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse((init as RequestInit).body as string).lineNumber).toBe(
      300028287181
    )
    // No discovery call: the answer was already known.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("does not call sms.ir when every recipient was filtered out", async () => {
    process.env.SMSIR_LINE_NUMBER = "30007"
    const fetchMock = vi.fn().mockResolvedValue(ok())
    vi.stubGlobal("fetch", fetchMock)

    // An empty batch is the shape a segment with no reachable phone numbers
    // produces. It must cost nothing rather than post an empty `mobiles` array.
    await expect(client().sendBulk(["", "  "], "سلام")).resolves.toEqual({
      status: "skipped",
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("retries a connection failure exactly like the template path", async () => {
    process.env.SMSIR_LINE_NUMBER = "30007"
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("socket disconnected"))
      .mockResolvedValueOnce(ok())
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      client().sendBulk(["09121234567"], "سلام")
    ).resolves.toMatchObject({ status: "sent" })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("fails loudly when sms.ir rejects the batch", async () => {
    process.env.SMSIR_LINE_NUMBER = "30007"
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 12, message: "insufficient credit" }),
      } as unknown as Response)
    )

    await expect(
      client().sendBulk(["09121234567"], "سلام")
    ).rejects.toThrow(/send\/bulk failed .*insufficient credit/)
  })
})

/**
 * Reading the account's lines.
 *
 * This is what turned "buy a dedicated line" into "you already have two": the
 * panel can only offer a real choice if it knows what the account owns, and
 * nobody should have to read a number off an sms.ir invoice.
 */
describe("SmsIrClient.getLines", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const client = () =>
    new SmsIrClient({ apiKey: "test-key", baseUrl: "https://api.sms.ir/v1" })

  it("asks sms.ir with a GET and the api key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 1, data: [30002108000668, 300028287181] }),
    } as unknown as Response)
    vi.stubGlobal("fetch", fetchMock)

    await expect(client().getLines()).resolves.toEqual([
      30002108000668, 300028287181,
    ])

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.sms.ir/v1/line")
    expect((init as RequestInit).method).toBe("GET")
    expect((init as RequestInit).headers).toMatchObject({
      "X-API-KEY": "test-key",
    })
  })

  it("reports no lines rather than throwing when sms.ir says no", async () => {
    // "This account owns nothing" is a state the panel renders, not an error it
    // reports — the operator needs to be told to buy a line, not shown a stack.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ status: 10, message: "invalid api key" }),
      } as unknown as Response)
    )

    await expect(client().getLines()).resolves.toEqual([])
  })

  it("does not call sms.ir at all without a key", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      new SmsIrClient({ apiKey: "" }).getLines()
    ).resolves.toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
