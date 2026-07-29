import { describe, expect, it } from "vitest"

import {
  gregorianToJalali,
  isJalaliLeapYear,
  jalaliMonthLength,
  jalaliMonthStartWeekday,
  jalaliToGregorian,
  toPersianDigits,
} from "../jalali"

// Anchors verified against Intl's built-in Persian calendar.
const ANCHORS: [[number, number, number], [number, number, number]][] = [
  [[2026, 7, 29], [1405, 5, 7]],
  [[2025, 9, 10], [1404, 6, 19]],
  [[2024, 3, 20], [1403, 1, 1]],
  [[2024, 3, 19], [1402, 12, 29]],
  [[1979, 2, 11], [1357, 11, 22]],
  [[2000, 1, 1], [1378, 10, 11]],
]

describe("jalali conversion", () => {
  it.each(ANCHORS)("converts %j ⇄ %j", (gregorian, jalali) => {
    expect(gregorianToJalali(...gregorian)).toEqual(jalali)
    expect(jalaliToGregorian(...jalali)).toEqual(gregorian)
  })

  it("agrees with Intl's persian calendar across a decade", () => {
    const fmt = new Intl.DateTimeFormat("en-u-ca-persian", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      timeZone: "UTC",
    })

    for (let t = Date.UTC(2018, 0, 1); t <= Date.UTC(2028, 0, 1); t += 86400000) {
      const d = new Date(t)
      const parts = fmt.formatToParts(d)
      const get = (type: string) =>
        Number(parts.find((p) => p.type === type)!.value.replace(/\D/g, ""))

      expect(
        gregorianToJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
      ).toEqual([get("year"), get("month"), get("day")])
    }
  })

  it("round-trips every day of a leap and a common year", () => {
    for (const jy of [1403, 1404]) {
      for (let jm = 1; jm <= 12; jm += 1) {
        for (let jd = 1; jd <= jalaliMonthLength(jy, jm); jd += 1) {
          expect(gregorianToJalali(...jalaliToGregorian(jy, jm, jd))).toEqual([
            jy,
            jm,
            jd,
          ])
        }
      }
    }
  })
})

describe("jalaliMonthLength", () => {
  it("is 31 for Farvardin–Shahrivar and 30 for Mehr–Bahman", () => {
    for (let jm = 1; jm <= 6; jm += 1) {
      expect(jalaliMonthLength(1404, jm)).toBe(31)
    }
    for (let jm = 7; jm <= 11; jm += 1) {
      expect(jalaliMonthLength(1404, jm)).toBe(30)
    }
  })

  it("gives Esfand 30 days only in a leap year", () => {
    expect(isJalaliLeapYear(1403)).toBe(true)
    expect(jalaliMonthLength(1403, 12)).toBe(30)

    expect(isJalaliLeapYear(1404)).toBe(false)
    expect(jalaliMonthLength(1404, 12)).toBe(29)
  })
})

describe("jalaliMonthStartWeekday", () => {
  it("returns a Saturday-first column index", () => {
    // 1404/01/01 = 2025-03-21 (Friday), 1404/06/01 = 2025-08-23 (Saturday),
    // 1404/05/01 = 2025-07-23 (Wednesday).
    expect(jalaliMonthStartWeekday(1404, 1)).toBe(6)
    expect(jalaliMonthStartWeekday(1404, 6)).toBe(0)
    expect(jalaliMonthStartWeekday(1404, 5)).toBe(4)
  })
})

describe("toPersianDigits", () => {
  it("maps latin digits and leaves the rest alone", () => {
    expect(toPersianDigits("1404/06/19")).toBe("۱۴۰۴/۰۶/۱۹")
    expect(toPersianDigits(7)).toBe("۷")
    expect(toPersianDigits("شهریور")).toBe("شهریور")
  })
})
