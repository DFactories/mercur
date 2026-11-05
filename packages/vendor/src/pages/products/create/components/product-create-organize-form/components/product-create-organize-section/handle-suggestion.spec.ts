import { describe, expect, it, vi } from "vitest"

import { applyHandleSuggestion, restoreHandleSuggestion } from "./handle-suggestion"

const TITLE = "ظرف یکبار مصرف سه خانه مایکروویوی کد 703"
const SUGGESTED = "compartment-containers-3-compartment-microwave-703"

/** The slice of react-hook-form the helpers use, with RHF's dirty semantics. */
const fakeForm = (values: Record<string, string>, dirty = false) => {
  const state = { values: { ...values }, dirty }
  const form = {
    getValues: (name: string) => state.values[name],
    setValue: vi.fn((name: string, value: string) => {
      state.values[name] = value
    }),
    getFieldState: () => ({ isDirty: state.dirty }),
    resetField: vi.fn((name: string) => {
      state.values[name] = ""
      state.dirty = false
    }),
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { form: form as any, state }
}

describe("applyHandleSuggestion", () => {
  it("fills an untouched handle once a category is chosen", async () => {
    const { form, state } = fakeForm({ title: TITLE, category_id: "pcat_1", handle: "" })
    const fetchSuggestion = vi.fn().mockResolvedValue(SUGGESTED)

    expect(await applyHandleSuggestion(form, fetchSuggestion)).toBe(SUGGESTED)
    expect(fetchSuggestion).toHaveBeenCalledWith(TITLE, "pcat_1")
    expect(state.values.handle).toBe(SUGGESTED)
  })

  it("refills after a category change while the producer has not edited it", async () => {
    const { form, state } = fakeForm({ title: TITLE, category_id: "pcat_2", handle: SUGGESTED })
    await applyHandleSuggestion(form, vi.fn().mockResolvedValue("trays-3-compartment-microwave-703"))
    expect(state.values.handle).toBe("trays-3-compartment-microwave-703")
  })

  it("never overwrites a handle the producer typed, but still returns the suggestion", async () => {
    const { form, state } = fakeForm({ title: TITLE, category_id: "pcat_1", handle: "my-own" }, true)
    expect(await applyHandleSuggestion(form, vi.fn().mockResolvedValue(SUGGESTED))).toBe(SUGGESTED)
    expect(state.values.handle).toBe("my-own")
    expect(form.setValue).not.toHaveBeenCalled()
  })

  it("asks nothing without a title or a category", async () => {
    const fetchSuggestion = vi.fn()
    await applyHandleSuggestion(fakeForm({ title: " ", category_id: "pcat_1", handle: "" }).form, fetchSuggestion)
    await applyHandleSuggestion(fakeForm({ title: TITLE, category_id: "", handle: "" }).form, fetchSuggestion)
    expect(fetchSuggestion).not.toHaveBeenCalled()
  })

  it("stays silent and leaves the field empty when the request fails", async () => {
    const { form, state } = fakeForm({ title: TITLE, category_id: "pcat_1", handle: "" })
    expect(await applyHandleSuggestion(form, vi.fn().mockRejectedValue(new Error("404")))).toBeUndefined()
    // fetchQuery answers a 401 with undefined after redirecting
    expect(await applyHandleSuggestion(form, vi.fn().mockResolvedValue(undefined))).toBeUndefined()
    expect(state.values.handle).toBe("")
  })

  it("drops an answer that arrives after the category changed again", async () => {
    const { form, state } = fakeForm({ title: TITLE, category_id: "pcat_1", handle: "" })
    expect(await applyHandleSuggestion(form, vi.fn().mockResolvedValue(SUGGESTED), () => false)).toBeUndefined()
    expect(state.values.handle).toBe("")
  })
})

describe("restoreHandleSuggestion", () => {
  it("puts the suggestion back and makes the field untouched again", () => {
    const { form, state } = fakeForm({ handle: "my-own" }, true)
    restoreHandleSuggestion(form, SUGGESTED)
    expect(state.values.handle).toBe(SUGGESTED)
    expect(state.dirty).toBe(false)
  })
})
