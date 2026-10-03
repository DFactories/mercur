import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * A `when(...).then()` that returns a value is turned into a step of its own.
 * Left unnamed, Medusa ids it `when-then-<ulid>` — a new id in every process —
 * and warns about it at every boot: a persisted execution resumed by another
 * process would not find that step. Upstream #1583 introduced one here.
 */
describe("applyProductChangeActionsWorkflow composition", () => {
  afterEach(() => vi.restoreAllMocks())

  it("names every when() that returns a value", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    await import("./apply-product-change-actions")

    const unnamed = warn.mock.calls.filter((call) =>
      String(call[0]).includes('"when" name should be defined'),
    )
    expect(unnamed).toEqual([])
  })
})
