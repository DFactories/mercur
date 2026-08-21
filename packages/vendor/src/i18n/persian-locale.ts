import i18n from "i18next"

import { installApiErrorTranslator } from "./api-error-translator"
import { installNativeDatePatch } from "./native-date-patch"
import { installPersianDigitInput } from "./persian-digit-input"
import { installZodErrorMap } from "./zod-error-map"

/*
 * Persian (Jalali) locale wiring for the vendor panel — the in-source
 * replacement for the host-side i18n overlay.
 *
 * The @medusajs/ui DatePicker is built on react-aria + @internationalized/date,
 * which pick the *calendar system* from the active locale. react-aria's
 * default-locale detector honors `window[Symbol.for("react-aria.i18n.locale")]`
 * above navigator.language, so pinning it to a Persian-default-calendar locale
 * (fa-IR → Intl calendar "persian") renders the picker as Jalali.
 */
const RA_LOCALE = Symbol.for("react-aria.i18n.locale")
const raLocaleFor = (lng: string) => (lng.startsWith("fa") ? "fa-IR" : lng)

const setReactAriaLocale = (lng: string) => {
  if (typeof window === "undefined") {
    return
  }
  ;(window as unknown as Record<symbol, string>)[RA_LOCALE] = raLocaleFor(lng)
  // react-aria caches the default locale and re-reads on `languagechange`.
  window.dispatchEvent(new Event("languagechange"))
}

// Set synchronously at module load (before react-aria initializes) so the very
// first render already uses the Persian calendar; refined once i18n is ready.
setReactAriaLocale("fa")

export const installPersianLocale = () => {
  // Translate Zod validation messages (shared instance → covers all forms).
  installZodErrorMap()
  // fa-IR + Asia/Tehran on native Date.toLocale* calls that bypass date-fns.
  installNativeDatePatch()
  // Localize backend error messages panel-wide (at the SDK error boundary).
  installApiErrorTranslator()
  // Accept Persian/Arabic-Indic digits in numeric inputs.
  installPersianDigitInput()
  // Keep the react-aria calendar locale in sync with the active language.
  setReactAriaLocale(i18n.language || "fa")
  i18n.on("languageChanged", (lng) => setReactAriaLocale(lng))
}
