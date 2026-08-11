import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  paymentProviderFallback,
  paymentProviderLabelKey,
} from "./payment-provider-label"

/**
 * The gateway name a seller reads on the order page.
 *
 * It used to be the raw column value under a `capitalize` class, which turns an
 * id into a fake word rather than a name: a Vandar payment showed
 * `Pp_vandar_vandar`, and every seeded/manual payment showed
 * `Pp_system_default`. `capitalize` only ever touches the first letter, so the
 * underscores and the doubled vendor name survived intact. Reproduced in the
 * running panel before the fix — the DOM text node held `pp_system_default`
 * while `innerText` reported `Pp_system_default`, which is how a CSS transform
 * gives itself away.
 *
 * Note the deliberate difference from the storefront: there the brand is
 * WITHHELD and only «درگاه اصلی» / «درگاه پشتیبان» is shown. Here it is named,
 * because a seller reconciling a payout is a business counterparty who needs to
 * know which PSP settled the money.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")

const locale = (code: string) =>
  JSON.parse(read(`src/i18n/translations/${code}.json`))

const fa = locale("fa")
const en = locale("en")

const GATEWAYS = [
  "pp_jibit_jibit",
  "pp_vandar_vandar",
  "pp_zarinpal_zarinpal",
  "pp_system_default",
]

describe("paymentProviderLabelKey", () => {
  it.each(GATEWAYS)("points %s at a translatable key", (id) => {
    expect(paymentProviderLabelKey(id)).toBe(`orders.payment.providers.${id}`)
  })
})

describe("every gateway has a real name in both locales", () => {
  it.each(GATEWAYS)("%s is named", (id) => {
    for (const [name, dict] of [
      ["fa", fa],
      ["en", en],
    ] as const) {
      const label = dict.orders?.payment?.providers?.[id]

      expect(label, `${name}: orders.payment.providers.${id} is missing`).toBeTruthy()
      // A "name" that is the id back again is the bug, not a translation.
      expect(label).not.toContain("pp_")
      expect(label).not.toContain("_")
    }
  })

  it("the Persian names are actually Persian", () => {
    // The panel is `dir="rtl"` and Persian-first; an untranslated "Vandar" would
    // pass a mere existence check.
    for (const id of GATEWAYS) {
      expect(fa.orders.payment.providers[id]).toMatch(/[؀-ۿ]/)
    }
  })
})

describe("an unknown gateway still never shows its id", () => {
  it("humanises a provider that is not in the map", () => {
    // The whole point of the fallback: a gateway added to the backend before
    // this map is updated must not regress to the original bug.
    expect(paymentProviderFallback("pp_stripe_usd")).toBe("Stripe (USD)")
  })

  it("does not throw on an id that has no underscore", () => {
    // `formatProvider` splits on "_" and indexes the result; a label is never
    // worth crashing the order page for.
    expect(() => paymentProviderFallback("manual")).not.toThrow()
  })
})

describe("the order page renders the label, not the column", () => {
  const source = read(
    "src/pages/orders/[id]/_components/order-payment-section/order-payment-section.tsx"
  )

  it("no longer prints provider_id directly", () => {
    expect(source).not.toMatch(/\{\s*payment\.provider_id\s*\}/)
  })

  it("goes through the shared label helper", () => {
    expect(source).toContain("paymentProviderLabelKey(payment.provider_id)")
    expect(source).toContain("paymentProviderFallback(payment.provider_id)")
  })

  it("drops the capitalize that manufactured the fake word", () => {
    const block = source.slice(
      source.indexOf("paymentProviderLabelKey(payment.provider_id)") - 400,
      source.indexOf("paymentProviderLabelKey(payment.provider_id)")
    )

    expect(block).not.toContain('className="capitalize"')
  })
})
