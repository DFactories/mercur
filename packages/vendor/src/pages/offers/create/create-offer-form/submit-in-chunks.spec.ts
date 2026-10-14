import { describe, expect, it, vi } from "vitest"

import {
  chunk,
  OFFER_CREATE_CHUNK_SIZE,
  submitInChunks,
} from "./submit-in-chunks"

const rows = (n: number) => Array.from({ length: n }, (_, i) => i)

describe("chunk", () => {
  it("splits into fixed-size parts and keeps the order", () => {
    expect(chunk(rows(5), 2)).toEqual([[0, 1], [2, 3], [4]])
    expect(chunk([], 2)).toEqual([])
  })

  it("refuses a size that would never advance", () => {
    expect(() => chunk(rows(3), 0)).toThrow()
  })
})

describe("submitInChunks", () => {
  it("sends the 2026-10-14 submission without any request over the size", async () => {
    // More than 100 ticked rows went out in one request and were refused.
    const send = vi.fn().mockResolvedValue({})

    const result = await submitInChunks(rows(250), send)

    expect(send).toHaveBeenCalledTimes(3)
    for (const [part] of send.mock.calls) {
      expect(part.length).toBeLessThanOrEqual(OFFER_CREATE_CHUNK_SIZE)
    }
    expect(send.mock.calls.flatMap(([part]) => part)).toEqual(rows(250))
    expect(result).toEqual({ sent: rows(250), failed: null })
  })

  it("stops at the first failing part and reports what was already saved", async () => {
    const error = new Error("duplicate")
    const send = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(error)
      .mockResolvedValue({})

    const result = await submitInChunks(rows(250), send)

    // The third part is never sent: the producer fixes the second and retries.
    expect(send).toHaveBeenCalledTimes(2)
    expect(result.sent).toEqual(rows(100))
    expect(result.failed).toEqual(rows(200).slice(100))
    expect(result.error).toBe(error)
  })

  it("sends a small submission as one request", async () => {
    const send = vi.fn().mockResolvedValue({})

    await submitInChunks(rows(3), send)

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(rows(3))
  })
})
