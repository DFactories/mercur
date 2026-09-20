import { describe, expect, it, vi } from "vitest"

/**
 * Table dates render in the panel's calendar, not en-US.
 *
 * ## The bug
 *
 * `useDate` formatted with `date-fns`' `format()` and no locale option, which
 * is always en-US. Every `DateCell` in every table of both panels goes through
 * it, so a Persian, right-to-left table showed "Jul 16, 2026" — about ninety
 * files' worth of screens. The file carried a TODO about the locale; nothing
 * acted on it.
 *
 * ## Why date-fns could not have fixed it
 *
 * The obvious repair is to pass date-fns' `faIR` locale. That still renders a
 * GREGORIAN date, just with Persian words: «۱۶ ژوئیه ۲۰۲۶». Iran uses the Solar
 * Hijri calendar, so the date would remain wrong while looking translated —
 * the worst kind of fix. `Intl` switches calendar with the locale, which is why
 * the hook uses it.
 *
 * The assertions below pin that distinction: a Persian format must carry the
 * Jalali YEAR, not merely Persian characters.
 */
const withLanguage = async (language: string) => {
  vi.resetModules()
  vi.doMock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language } }) }))
  const { useDate } = await import("./use-date")
  return useDate()
}

// 2026-07-16 Gregorian is 1405-04-25 Jalali.
const INSTANT = "2026-07-16T10:30:00Z"

describe("useDate in Persian", () => {
  it("formats in the Jalali calendar, not Gregorian-with-Persian-words", async () => {
    const { getFullDate } = await withLanguage("fa")
    const out = getFullDate({ date: INSTANT })

    expect(out).toContain("۱۴۰۵")        // Jalali year — the whole point
    expect(out).not.toContain("۲۰۲۶")    // NOT the Gregorian year in Persian digits
    expect(out).not.toMatch(/[A-Za-z]/)  // and no English month name
  })

  it("includes the time when asked, still in Persian digits", async () => {
    const { getFullDate } = await withLanguage("fa")
    const withTime = getFullDate({ date: INSTANT, includeTime: true })
    const without = getFullDate({ date: INSTANT })

    expect(withTime.length).toBeGreaterThan(without.length)
    expect(withTime).not.toMatch(/[A-Za-z]/)
  })

  it("formats relative dates in Persian too", async () => {
    const { getRelativeDate } = await withLanguage("fa")
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600 * 1000)

    const out = getRelativeDate(threeDaysAgo)
    // date-fns' formatDistance returned "3 days ago" regardless of language.
    expect(out).not.toMatch(/[A-Za-z]/)
    expect(out.length).toBeGreaterThan(0)
  })
})

describe("useDate in English", () => {
  it("still formats Gregorian for the English panel", async () => {
    const { getFullDate } = await withLanguage("en")
    const out = getFullDate({ date: INSTANT })

    expect(out).toContain("2026")
    expect(out).toMatch(/Jul/)
  })

  it("formats relative dates in English", async () => {
    const { getRelativeDate } = await withLanguage("en")
    const out = getRelativeDate(new Date(Date.now() - 3 * 24 * 3600 * 1000))
    expect(out).toMatch(/day/)
  })
})

describe("bad input", () => {
  it("returns an empty string rather than 'Invalid Date'", async () => {
    // Unchanged behaviour, pinned: the cell stays blank instead of printing
    // "Invalid Date" into a table column.
    const { getFullDate, getRelativeDate } = await withLanguage("fa")
    expect(getFullDate({ date: "not-a-date" })).toBe("")
    expect(getRelativeDate("not-a-date")).toBe("")
  })
})
