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

  it("refuses to send without a sender line", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok())
    vi.stubGlobal("fetch", fetchMock)

    // Borrowing the OTP line for marketing traffic is how a service line gets
    // suspended, so the absence of a configured line is an error, not a default.
    await expect(client().sendBulk(["09121234567"], "سلام")).rejects.toThrow(
      /SMSIR_LINE_NUMBER/
    )
    expect(fetchMock).not.toHaveBeenCalled()
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
