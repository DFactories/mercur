import { useTranslation } from "react-i18next";

/**
 * Dates, in the panel's language AND its calendar.
 *
 * ## What this replaces
 *
 * `date-fns`' `format()` with no locale option, which always formats `en-US`.
 * The file carried a TODO acknowledging it. Every `DateCell` in every table of
 * both panels goes through here, so a Persian operator read "Jul 16, 2026" in
 * a right-to-left Persian table — roughly ninety files' worth of screens.
 *
 * ## Why not date-fns' Persian locale
 *
 * Because it would not have fixed it. `date-fns` is Gregorian-only: its `faIR`
 * locale renders «۱۶ ژوئیه ۲۰۲۶» — Persian words for a Gregorian date. Iran
 * uses the Solar Hijri (Jalali) calendar, so that is still the wrong date, just
 * harder to notice. `Intl` switches calendar with the locale, so `fa-IR` gives
 * «۲۵ تیر ۱۴۰۵», which is the same instant as an Iranian reads it.
 *
 * ## Contract
 *
 * `getFullDate` and `getRelativeDate` keep their exact signatures — 90 call
 * sites depend on them, and this change is meant to be invisible except that
 * the output is finally right.
 */

/** The panel language → a locale whose calendar and digits match it. */
const localeFor = (language: string | undefined): string =>
  language?.startsWith("fa") ? "fa-IR" : "en-US";

const DIVISIONS: [amount: number, unit: Intl.RelativeTimeFormatUnit][] = [
  [60, "second"],
  [60, "minute"],
  [24, "hour"],
  [7, "day"],
  [4.34524, "week"],
  [12, "month"],
  [Number.POSITIVE_INFINITY, "year"],
];

export const useDate = () => {
  const { i18n } = useTranslation();
  const locale = localeFor(i18n.language);

  const getFullDate = ({
    date,
    includeTime = false,
  }: {
    date: string | Date;
    includeTime?: boolean;
  }) => {
    const ensuredDate = new Date(date);

    // Unchanged: an unparseable date returns "" so the cell stays empty rather
    // than printing "Invalid Date" into a table.
    if (isNaN(ensuredDate.getTime())) {
      return "";
    }

    return ensuredDate.toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    });
  };

  /**
   * "3 days ago" in the panel's language.
   *
   * `Intl.RelativeTimeFormat` rather than date-fns' `formatDistance`, which has
   * the same missing-locale bug and would need a locale object imported per
   * language. This needs nothing imported and is correct for every language the
   * panel can be set to.
   */
  function getRelativeDate(date: string | Date): string {
    const ensuredDate = new Date(date);
    if (isNaN(ensuredDate.getTime())) {
      return "";
    }

    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    let duration = (ensuredDate.getTime() - Date.now()) / 1000;

    for (const [amount, unit] of DIVISIONS) {
      if (Math.abs(duration) < amount) {
        return rtf.format(Math.round(duration), unit);
      }
      duration /= amount;
    }

    return rtf.format(Math.round(duration), "year");
  }

  return {
    getFullDate,
    getRelativeDate,
  };
};
