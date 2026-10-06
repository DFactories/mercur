import type { BackendModule } from "i18next"

import { lazyTranslations, type TranslationResource } from "./translations"

type Overrides = Record<string, Record<string, TranslationResource>>

/**
 * Loads a language that is not bundled when the panel switches to it, then lays
 * the app's own translations for that language over it, as the bundled ones
 * get at start-up.
 */
export const createLazyTranslationsBackend = (
  overrides: Overrides,
  merge: (
    base: TranslationResource,
    override: TranslationResource,
  ) => TranslationResource,
): BackendModule => ({
  type: "backend",
  init: () => undefined,
  read: (language, namespace, callback) => {
    const load = lazyTranslations[language]

    if (!load) {
      callback(null, {})
      return
    }

    load()
      .then((module) =>
        callback(
          null,
          merge(module.default, overrides[language]?.[namespace] ?? {}),
        ),
      )
      .catch((error: Error) => callback(error, false))
  },
})
