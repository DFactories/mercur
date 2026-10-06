import { ClientError } from "@mercurjs/client"
import type { LoaderFunctionArgs } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

const me = vi.hoisted(() => vi.fn())

vi.mock("../../../lib/client", () => ({
  sdk: { admin: { users: { me: { query: me } } } },
}))

import { queryClient } from "../../../lib/query-client"
import { hasSession } from "./session"

const unauthorized = () => new ClientError("Unauthorized", "Unauthorized", 401)

const navigation = () =>
  ({
    request: new Request("http://localhost/products"),
    params: {},
    context: undefined,
  }) as LoaderFunctionArgs

afterEach(() => {
  queryClient.clear()
  vi.useRealTimers()
  me.mockReset()
})

describe("hasSession", () => {
  it("is false on a 401, after a single request", async () => {
    me.mockRejectedValue(unauthorized())

    await expect(hasSession(navigation())).resolves.toBe(false)
    expect(me).toHaveBeenCalledTimes(1)
  })

  it("lets every loader of a navigation share one request", async () => {
    me.mockRejectedValue(unauthorized())

    const args = navigation()

    await expect(
      Promise.all([hasSession(args), hasSession(args), hasSession(args)])
    ).resolves.toEqual([false, false, false])
    expect(me).toHaveBeenCalledTimes(1)
  })

  it("answers a loader that starts after the 401 without asking again", async () => {
    // A lazy route's loader runs once its chunk has loaded, which is often
    // after the guard's own check has already failed.
    me.mockRejectedValue(unauthorized())
    const args = navigation()

    await expect(hasSession(args)).resolves.toBe(false)
    await expect(hasSession(args)).resolves.toBe(false)

    expect(me).toHaveBeenCalledTimes(1)
  })

  it("asks again on the next navigation, so signing in is noticed", async () => {
    me.mockRejectedValueOnce(unauthorized()).mockResolvedValueOnce(
      { user: { id: "user_1" } }
    )

    await expect(hasSession(navigation())).resolves.toBe(false)
    await expect(hasSession(navigation())).resolves.toBe(true)

    expect(me).toHaveBeenCalledTimes(2)
  })

  it("is true for a user and fills the cache useMe reads", async () => {
    const user = { id: "user_1" }
    me.mockResolvedValue({ user })

    await expect(hasSession(navigation())).resolves.toBe(true)
    await expect(hasSession(navigation())).resolves.toBe(true)

    expect(me).toHaveBeenCalledTimes(1)
    expect(queryClient.getQueryData(["users", "me"])).toEqual({ user })
  })

  it("is false when the answer names no user", async () => {
    me.mockResolvedValue({})

    await expect(hasSession(navigation())).resolves.toBe(false)
  })

  it("still retries a failure that is not about the session", async () => {
    vi.useFakeTimers()
    me.mockRejectedValueOnce(
      new ClientError("Internal Server Error", "Internal Server Error", 500)
    ).mockResolvedValueOnce({ user: { id: "user_1" } })

    const answer = hasSession(navigation())
    await vi.runAllTimersAsync()

    await expect(answer).resolves.toBe(true)
    expect(me).toHaveBeenCalledTimes(2)
  })
})
