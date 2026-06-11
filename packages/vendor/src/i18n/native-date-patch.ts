/*
 * Force Persian (Jalali) + Tehran timezone on native Date localization.
 *
 * A few bundle surfaces (e.g. the payouts page) format dates with the native
 * `new Date(x).toLocaleDateString(undefined, …)` — browser-default locale and
 * timezone — instead of the date-fns `useDate` path. The Jalali date-fns alias
 * can't reach these, and they aren't raw ISO either, so the only host-side hook
 * is to patch `Date.prototype.toLocale*` to default the locale to fa-IR (whose
 * default calendar is Persian/Jalali) and pin the zone to Asia/Tehran.
 *
 * Scope is deliberately narrow & safe:
 *  - Only when NO explicit locale was passed (undefined / "" / []). Calls with
 *    an explicit locale are left untouched.
 *  - Only while the panel language is Persian (language-independent otherwise).
 *  - Only patches Date.prototype — Number.prototype.toLocaleString (currency
 *    amounts) is a different prototype and is NOT affected.
 *  - A caller-supplied `timeZone` still wins; we only fill it in when absent.
 */
import i18n from "i18next"

const FA_LOCALE = "fa-IR"
const TEHRAN_TZ = "Asia/Tehran"

const isUnsetLocale = (l: unknown): boolean =>
  l == null || l === "" || (Array.isArray(l) && l.length === 0)

type DateLocaleMethod =
  | "toLocaleDateString"
  | "toLocaleTimeString"
  | "toLocaleString"

const PATCH_FLAG = "__faTehranPatched__"

export const installNativeDatePatch = () => {
  const methods: DateLocaleMethod[] = [
    "toLocaleDateString",
    "toLocaleTimeString",
    "toLocaleString",
  ]

  for (const method of methods) {
    const original = Date.prototype[method] as (
      this: Date,
      locales?: Intl.LocalesArgument,
      options?: Intl.DateTimeFormatOptions,
    ) => string

    // Guard against double-patching across HMR reloads.
    if ((original as unknown as Record<string, unknown>)[PATCH_FLAG]) continue

    const patched = function (
      this: Date,
      locales?: Intl.LocalesArgument,
      options?: Intl.DateTimeFormatOptions,
    ): string {
      if (i18n.language === "fa" && isUnsetLocale(locales)) {
        return original.call(this, FA_LOCALE, {
          timeZone: TEHRAN_TZ,
          ...(options ?? {}),
        })
      }
      return original.call(this, locales, options)
    }
    ;(patched as unknown as Record<string, unknown>)[PATCH_FLAG] = true
    Date.prototype[method] = patched as typeof original
  }
}
