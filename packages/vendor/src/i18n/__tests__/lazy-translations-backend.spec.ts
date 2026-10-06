import { describe, expect, it } from "vitest"

import { createLazyTranslationsBackend } from "../lazy-translations-backend"
import translations, { lazyTranslations } from "../translations"

const merge = (
  base: Record<string, unknown>,
  override: Record<string, unknown>,
) => ({ ...base, ...override })

const read = (
  backend: ReturnType<typeof createLazyTranslationsBackend>,
  language: string,
) =>
  new Promise<Record<string, unknown>>((resolve, reject) => {
    backend.read(language, "translation", (error, data) =>
      error ? reject(error) : resolve(data as Record<string, unknown>),
    )
  })

describe("bundled translations", () => {
  it("bundles only the fallback and the panel's own language", () => {
    expect(Object.keys(translations).sort()).toEqual(["en", "fa"])
  })

  it("leaves every other language to be fetched on demand", () => {
    expect(lazyTranslations.en).toBeUndefined()
    expect(lazyTranslations.fa).toBeUndefined()
    expect(typeof lazyTranslations.de).toBe("function")
  })
})

describe("createLazyTranslationsBackend", () => {
  it("loads a language when it is selected and lays the app's overrides over it", async () => {
    const backend = createLazyTranslationsBackend(
      { de: { translation: { appOnly: "aus der App" } } },
      merge,
    )

    const de = await read(backend, "de")

    expect(de.appOnly).toBe("aus der App")
    expect(Object.keys(de).length).toBeGreaterThan(10)
  })

  it("answers an unknown language with nothing rather than failing", async () => {
    const backend = createLazyTranslationsBackend({}, merge)

    await expect(read(backend, "xx")).resolves.toEqual({})
  })
})
