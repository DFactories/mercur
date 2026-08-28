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
