import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import en from "../../../../../../i18n/translations/en.json"
import fa from "../../../../../../i18n/translations/fa.json"

/**
 * Gate for the shipment-evidence step on the fulfillment form.
 *
 * Two things about this field are load-bearing and both are easy to undo by
 * accident, so they are asserted rather than reviewed:
 *
 * 1. It must never block a dispatch. The clip is evidence for a later claim,
 *    and refusing to let a factory ship because an upload failed trades a real
 *    sale for a hypothetical dispute.
 * 2. Its strings must exist in Persian. A missing key renders the key path to a
 *    producer, and here that path replaces the sentence explaining that a
 *    missing video counts against them.
 */

const dir = join(__dirname, "..")

const field = readFileSync(join(dir, "shipment-evidence-field.tsx"), "utf8")
const form = readFileSync(
  join(dir, "order-create-fulfillment-form.tsx"),
  "utf8"
)

const at = (bundle: unknown, path: string): unknown =>
  path
    .split(".")
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[key]
          : undefined,
      bundle
    )

describe("the evidence step never blocks a dispatch", () => {
  it("does not gate the submit button on an uploaded clip", () => {
    // The submit is disabled on the shipping option alone. Adding the evidence
    // key to that condition is the regression this asserts against.
    expect(form).toContain("disabled={!shippingOptionId}")
    expect(form).not.toMatch(/disabled=\{[^}]*evidenceKey/)
  })

  it("records the clip after the fulfillment, inside its own try", () => {
    // Order matters: the goods have shipped by then, so a failure here is a
    // missing video, not a failed dispatch.
    const submitIndex = form.indexOf("await createOrderFulfillment(payload)")
    const evidenceIndex = form.indexOf("shipment-evidence`")
    expect(submitIndex).toBeGreaterThan(-1)
    expect(evidenceIndex).toBeGreaterThan(submitIndex)
    expect(form).toMatch(/try \{[\s\S]*shipment-evidence`[\s\S]*\} catch \{/)
  })
})

describe("the API calls go through the panel's client", () => {
  it("uses fetchQuery for the two API routes", () => {
    expect(field).toContain("fetchQuery(")
    expect(form).toContain("fetchQuery(")
  })

  it("keeps exactly one bare fetch, for the presigned PUT", () => {
    // The PUT goes to object storage, not the API — the typed client has no
    // route for it and its credentials would break the signature.
    const bareFetches = field.match(/[^.\w]fetch\(/g) ?? []
    expect(bareFetches).toHaveLength(1)
    expect(field).toContain('method: "PUT"')
    expect(form).not.toMatch(/[^.\w]fetch\(/)
  })
})

describe("the producer can read every state of it", () => {
  const KEYS = [
    "label",
    "hint",
    "choose",
    "replace",
    "tooLarge",
    "failed",
    "notRecorded",
    "missingWarning",
  ]

  it.each(KEYS)("orders.fulfillment.shipmentEvidence.%s is translated", (key) => {
    const path = `orders.fulfillment.shipmentEvidence.${key}`
    expect(typeof at(fa, path)).toBe("string")
    expect(typeof at(en, path)).toBe("string")
  })

  it("warns when nothing is attached", () => {
    // The warning is the entire behavioural contract with the producer: they
    // are told, never stopped.
    expect(field).toContain("missingWarning")
    expect(field).toContain('variant="warning"')
  })
})
