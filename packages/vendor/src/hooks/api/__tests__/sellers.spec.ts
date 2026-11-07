import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("../../../lib/client", () => ({ sdk: {} }))
// The hook only builds the options it hands to useMutation; read them back without React.
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useMutation: (options: unknown) => options,
}))

import { queryClient } from "../../../lib/query-client"
import { queryKeysFactory } from "../../../lib/query-key-factory"
import { useSelectSeller } from "../sellers"

const previousStoreOrders = queryKeysFactory("orders").list({ limit: 10 })

const switchStore = async (options?: Parameters<typeof useSelectSeller>[0]) => {
  const { onSuccess } = useSelectSeller(options) as unknown as {
    onSuccess: (...args: unknown[]) => unknown
  }
  await onSuccess({}, { seller_id: "sel_next" }, undefined)
}

afterEach(() => queryClient.clear())

// 2026-11-07, production: after switching away from the only store with an
// order, the next store's «سفارش‌ها» listed that order. Nothing was requested:
// the list came from this cache, still fresh under the 90 s staleTime.
describe("useSelectSeller", () => {
  it("drops every query cached for the previous store", async () => {
    queryClient.setQueryData(previousStoreOrders, { orders: [{ id: "order_a" }], count: 1 })

    await switchStore()

    expect(queryClient.getQueryData(previousStoreOrders)).toBeUndefined()
  })

  it("still drops them when the caller passes its own onSuccess", async () => {
    queryClient.setQueryData(previousStoreOrders, { orders: [{ id: "order_a" }], count: 1 })
    const onSuccess = vi.fn()

    await switchStore({ onSuccess })

    expect(queryClient.getQueryData(previousStoreOrders)).toBeUndefined()
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })
})
