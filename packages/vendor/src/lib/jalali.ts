/*
 * Jalali (Solar Hijri) ↔ Gregorian conversion.
 *
 * Implemented in-package rather than pulled from a library because the panel's
 * `date-fns` specifier is re-aliased by the host app (see the consuming app's
 * vite config), so calendar arithmetic done through it is not stable at package
 * build time. This module is pure integer math on civil dates — no Date, no
 * timezone, no locale — which keeps the picker's grid independent of the
 * browser zone.
 *
 * Algorithm: Borkowski's 33-year-cycle approximation, the same one used by
 * jalaali-js. Exact for 1178–1633 Jalali (1799–2255 Gregorian), far wider than
 * any date this panel accepts.
 */

// Truncating (toward zero) division, NOT flooring — the algorithm's constants
// assume C-style integer division and the two differ once an intermediate goes
// negative (e.g. `div(gm - 8, 6)` for January).
const div = (a: number, b: number): number => Math.trunc(a / b)
const mod = (a: number, b: number): number => a - Math.trunc(a / b) * b

const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192,
  2262, 2324, 2394, 2456, 3178,
]

type JalaliCal = {
  /** 0 when `jy` is a leap year. */
  leap: number
  /** Gregorian year of Farvardin 1 of `jy`. */
  gy: number
  /** March day-of-month on which Farvardin 1 of `jy` falls. */
  march: number
}

/** Calendar constants for a Jalali year (leap offset + its Gregorian anchor). */
export const jalaliCal = (jy: number): JalaliCal => {
  const breaksCount = BREAKS.length
  const gy = jy + 621

  let leapJ = -14
  let jp = BREAKS[0]

  if (jy < jp || jy >= BREAKS[breaksCount - 1]) {
    throw new RangeError(`Jalali year ${jy} is out of the supported range`)
  }

  let jump = 0
  for (let i = 1; i < breaksCount; i += 1) {
    const jm = BREAKS[i]
    jump = jm - jp
    if (jy < jm) {
      break
    }
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4)
    jp = jm
  }

  let n = jy - jp

  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4)
  if (mod(jump, 33) === 4 && jump - n === 4) {
    leapJ += 1
  }

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150
  const march = 20 + leapJ - leapG

  if (jump - n < 6) {
    n = n - jump + div(jump + 4, 33) * 33
  }

  let leap = mod(mod(n + 1, 33) - 1, 4)
  if (leap === -1) {
    leap = 4
  }

  return { leap, gy, march }
}

export const isJalaliLeapYear = (jy: number): boolean => jalaliCal(jy).leap === 0

/** Days in a Jalali month: 31 for months 1–6, 30 for 7–11, 29/30 for Esfand. */
export const jalaliMonthLength = (jy: number, jm: number): number => {
  if (jm <= 6) {
    return 31
  }
  if (jm <= 11) {
    return 30
  }
  return isJalaliLeapYear(jy) ? 30 : 29
}

/** Gregorian civil date → Julian Day Number. */
const gregorianToJdn = (gy: number, gm: number, gd: number): number => {
  const d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408
  return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752
}

/** Julian Day Number → Gregorian civil date. */
const jdnToGregorian = (jdn: number): [number, number, number] => {
  let j = 4 * jdn + 139361631
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908
  const i = div(mod(j, 1461), 4) * 5 + 308
  const gd = div(mod(i, 153), 5) + 1
  const gm = mod(div(i, 153), 12) + 1
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6)
  return [gy, gm, gd]
}

const jalaliToJdn = (jy: number, jm: number, jd: number): number => {
  const { gy, march } = jalaliCal(jy)
  return (
    gregorianToJdn(gy, 3, march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1
  )
}

export const jalaliToGregorian = (
  jy: number,
  jm: number,
  jd: number
): [number, number, number] => jdnToGregorian(jalaliToJdn(jy, jm, jd))

export const gregorianToJalali = (
  gy: number,
  gm: number,
  gd: number
): [number, number, number] => {
  const jdn = gregorianToJdn(gy, gm, gd)
  let jy = jdnToGregorian(jdn)[0] - 621
  const cal = jalaliCal(jy)
  const farvardin1 = gregorianToJdn(cal.gy, 3, cal.march)

  let k = jdn - farvardin1
  if (k >= 0) {
    if (k <= 185) {
      return [jy, 1 + div(k, 31), mod(k, 31) + 1]
    }
    k -= 186
  } else {
    // Still in the previous Jalali year. The leap flag that matters is the one
    // for the year we started from, not the decremented one.
    jy -= 1
    k += 179
    if (cal.leap === 1) {
      k += 1
    }
  }

  return [jy, 7 + div(k, 30), mod(k, 30) + 1]
}

export const JALALI_MONTHS_FA = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
] as const

/** Saturday-first, matching the Iranian week. */
export const JALALI_WEEKDAYS_FA = [
  "ش",
  "ی",
  "د",
  "س",
  "چ",
  "پ",
  "ج",
] as const

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹"

export const toPersianDigits = (value: string | number): string =>
  String(value).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)])

/**
 * Weekday column (0 = Saturday) of the 1st of a Jalali month. `Date.getDay()`
 * is 0 = Sunday, so Saturday-first is `(day + 1) % 7`.
 */
export const jalaliMonthStartWeekday = (jy: number, jm: number): number => {
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, 1)
  return (new Date(Date.UTC(gy, gm - 1, gd)).getUTCDay() + 1) % 7
}
