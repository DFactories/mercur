import { describe, expect, it } from "vitest"

import { withoutImplicitHandleChange } from "./seller-handle"

/**
 * A seller update must never move the store's public address by accident.
 *
 * Reproduced 2026-09-24 on core .29: `POST /admin/sellers/:id` with
 * `{ name: "Handle Probe", description: "x" }` — the SAME name the store
 * already had — rewrote its handle from `handle-probe-test` to
 * `handle-probe`, because the update path re-derived a handle from any name it
 * was given. The live round-trip is pinned in
 * `integration-tests/http/dfactories/seller-handle-update.spec.ts`.
 */
describe("withoutImplicitHandleChange", () => {
  it("does not derive a handle from the name", () => {
    const update = withoutImplicitHandleChange({
      name: "Handle Probe",
      description: "x",
    })

    expect(update).toEqual({ name: "Handle Probe", description: "x" })
    expect(update).not.toHaveProperty("handle")
  })

  it("keeps a handle the caller names explicitly", () => {
    expect(
      withoutImplicitHandleChange({ name: "Handle Probe", handle: "new-home" }),
    ).toEqual({ name: "Handle Probe", handle: "new-home" })
  })

  it.each([[""], [null], [undefined]])(
    "drops a blank handle (%p) instead of clearing or regenerating it",
    (handle) => {
      const update = withoutImplicitHandleChange({
        id: "sel_1",
        name: "Handle Probe",
        handle,
      })

      expect(update).toEqual({ id: "sel_1", name: "Handle Probe" })
      expect(update).not.toHaveProperty("handle")
    },
  )
})
