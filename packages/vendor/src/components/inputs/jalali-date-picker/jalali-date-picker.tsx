import { ChevronLeft, ChevronRight, XMarkMini } from "@medusajs/icons"
import { DatePicker, Popover, Text, clx } from "@medusajs/ui"
import { forwardRef, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  JALALI_MONTHS_FA,
  JALALI_WEEKDAYS_FA,
  gregorianToJalali,
  jalaliMonthLength,
  jalaliMonthStartWeekday,
  jalaliToGregorian,
  toPersianDigits,
} from "@lib/jalali"

type Granularity = "day" | "minute"

export type JalaliDatePickerProps = {
  value?: Date | null
  onChange?: (value: Date | null) => void
  onBlur?: () => void
  name?: string
  granularity?: Granularity
  minValue?: Date | null
  maxValue?: Date | null
  isDisabled?: boolean
  className?: string
  id?: string
  "aria-label"?: string
  "data-testid"?: string
  /** Accepted for drop-in parity with @medusajs/ui DatePicker. */
  shouldCloseOnSelect?: boolean
  modal?: boolean
  hourCycle?: 12 | 24
  /**
   * Which grid the popover opens on. Birth dates and other far-past values
   * should start at `"year"` so the user is not paging months backwards.
   */
  initialView?: View
}

type View = "day" | "month" | "year"

const YEARS_PER_PAGE = 12

const clampDay = (jy: number, jm: number, jd: number) =>
  Math.min(jd, jalaliMonthLength(jy, jm))

const pad = (n: number) => String(n).padStart(2, "0")

/**
 * Jalali (Shamsi) date picker.
 *
 * Replaces the @medusajs/ui DatePicker for Persian, where that component is
 * unusable on two counts: react-aria derives the segment order from the locale
 * (fa-IR yields year/month/day, the reverse of what Iranian users type) and its
 * calendar can only step one month at a time, so picking a distant year — a
 * birth date, say — means dozens of clicks.
 *
 * Navigation drills down instead: the header title switches day → month → year,
 * and the year grid pages a dozen at a time, so any year is at most three
 * clicks away.
 *
 * Outside Persian this renders the stock DatePicker untouched.
 */
export const JalaliDatePicker = forwardRef<
  HTMLButtonElement,
  JalaliDatePickerProps
>(
  (
    {
      value,
      onChange,
      onBlur,
      name,
      granularity = "day",
      minValue,
      maxValue,
      isDisabled,
      className,
      id,
      "aria-label": ariaLabel,
      "data-testid": dataTestId,
      initialView = "day",
      ...rest
    },
    ref
  ) => {
    const { t, i18n } = useTranslation()
    const isFa = (i18n.language || "").startsWith("fa")

    const [open, setOpen] = useState(false)
    const [view, setView] = useState<View>(initialView)

    const selected = useMemo(() => {
      if (!value || Number.isNaN(value.getTime())) {
        return null
      }
      const [jy, jm, jd] = gregorianToJalali(
        value.getFullYear(),
        value.getMonth() + 1,
        value.getDate()
      )
      return { jy, jm, jd }
    }, [value])

    const todayJalali = useMemo(() => {
      const now = new Date()
      const [jy, jm, jd] = gregorianToJalali(
        now.getFullYear(),
        now.getMonth() + 1,
        now.getDate()
      )
      return { jy, jm, jd }
    }, [])

    // The month the grid is showing, independent of the selected value so the
    // user can browse without changing anything.
    const [cursor, setCursor] = useState(() => ({
      jy: selected?.jy ?? todayJalali.jy,
      jm: selected?.jm ?? todayJalali.jm,
    }))

    // Re-anchor when the popover opens so it always lands on the current value.
    useEffect(() => {
      if (open) {
        setView(initialView)
        setCursor({
          jy: selected?.jy ?? todayJalali.jy,
          jm: selected?.jm ?? todayJalali.jm,
        })
      }
    }, [
      open,
      initialView,
      selected?.jy,
      selected?.jm,
      todayJalali.jy,
      todayJalali.jm,
    ])

    if (!isFa) {
      return (
        <DatePicker
          value={value ?? null}
          onChange={onChange}
          onBlur={onBlur}
          name={name}
          granularity={granularity}
          minValue={minValue ?? undefined}
          maxValue={maxValue ?? undefined}
          isDisabled={isDisabled}
          className={className}
          id={id}
          aria-label={ariaLabel}
          data-testid={dataTestId}
          {...rest}
        />
      )
    }

    /** Out-of-range days are rendered disabled rather than hidden. */
    const isOutOfRange = (jy: number, jm: number, jd: number) => {
      if (!minValue && !maxValue) {
        return false
      }
      const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd)
      const day = new Date(gy, gm - 1, gd).setHours(0, 0, 0, 0)
      if (minValue && day < new Date(minValue).setHours(0, 0, 0, 0)) {
        return true
      }
      return !!maxValue && day > new Date(maxValue).setHours(0, 0, 0, 0)
    }

    const emit = (jy: number, jm: number, jd: number) => {
      const [gy, gm, gd] = jalaliToGregorian(jy, jm, clampDay(jy, jm, jd))
      // `selected` is null for an unparseable incoming value; starting from it
      // would make every subsequent setter yield NaN.
      const keepTime = selected ? value : null
      const next = new Date(keepTime ?? Date.now())
      // Setting all three at once — a two-step set would roll over when the
      // current day-of-month exceeds the target month's length.
      next.setFullYear(gy, gm - 1, gd)
      if (!keepTime) {
        next.setHours(0, 0, 0, 0)
      }
      next.setSeconds(0, 0)
      onChange?.(next)
    }

    const setTime = (hours: number, minutes: number) => {
      const base = value ? new Date(value) : new Date()
      if (!value) {
        const [gy, gm, gd] = jalaliToGregorian(
          todayJalali.jy,
          todayJalali.jm,
          todayJalali.jd
        )
        base.setFullYear(gy, gm - 1, gd)
      }
      base.setHours(hours, minutes, 0, 0)
      onChange?.(base)
    }

    const shiftMonth = (delta: number) => {
      setCursor((c) => {
        const total = c.jy * 12 + (c.jm - 1) + delta
        return { jy: Math.floor(total / 12), jm: (total % 12) + 1 }
      })
    }

    const label = selected
      ? `${toPersianDigits(selected.jd)} ${JALALI_MONTHS_FA[selected.jm - 1]} ${toPersianDigits(selected.jy)}` +
        (granularity === "minute" && value
          ? ` — ${toPersianDigits(pad(value.getHours()))}:${toPersianDigits(pad(value.getMinutes()))}`
          : "")
      : null

    const yearPageStart =
      cursor.jy - ((cursor.jy % YEARS_PER_PAGE) + YEARS_PER_PAGE) % YEARS_PER_PAGE

    const headerTitle =
      view === "day"
        ? `${JALALI_MONTHS_FA[cursor.jm - 1]} ${toPersianDigits(cursor.jy)}`
        : view === "month"
          ? toPersianDigits(cursor.jy)
          : `${toPersianDigits(yearPageStart)} – ${toPersianDigits(yearPageStart + YEARS_PER_PAGE - 1)}`

    const step = (delta: number) => {
      if (view === "day") {
        shiftMonth(delta)
      } else if (view === "month") {
        setCursor((c) => ({ ...c, jy: c.jy + delta }))
      } else {
        setCursor((c) => ({ ...c, jy: c.jy + delta * YEARS_PER_PAGE }))
      }
    }

    const leadingBlanks = jalaliMonthStartWeekday(cursor.jy, cursor.jm)
    const daysInMonth = jalaliMonthLength(cursor.jy, cursor.jm)

    return (
      <Popover open={open} onOpenChange={setOpen}>
        {/* Clear sits beside the trigger, not inside it: a button nested in a
            button is invalid HTML and swallows its own keyboard activation. */}
        <div className={clx("relative w-full", className)}>
          <Popover.Trigger asChild>
            <button
              ref={ref}
              type="button"
              id={id}
              name={name}
              dir="rtl"
              onBlur={onBlur}
              disabled={isDisabled}
              aria-label={ariaLabel ?? t("jalaliDatePicker.ariaLabel")}
              data-testid={dataTestId}
              className={clx(
                "bg-ui-bg-field shadow-borders-base txt-compact-small text-ui-fg-base flex h-8 w-full items-center rounded-md px-2 text-start outline-none transition-fg",
                "hover:bg-ui-bg-field-hover focus-visible:shadow-borders-interactive-with-active",
                "disabled:bg-ui-bg-disabled disabled:text-ui-fg-disabled disabled:cursor-not-allowed",
                label && !isDisabled && "pe-8"
              )}
            >
              <span className={clx(!label && "text-ui-fg-muted")}>
                {label ?? t("jalaliDatePicker.placeholder")}
              </span>
            </button>
          </Popover.Trigger>
          {label && !isDisabled ? (
            <button
              type="button"
              aria-label={t("jalaliDatePicker.clear")}
              data-testid="jalali-date-picker-clear"
              className="text-ui-fg-muted hover:text-ui-fg-base absolute inset-y-0 end-2 flex items-center outline-none"
              onClick={() => onChange?.(null)}
            >
              <XMarkMini />
            </button>
          ) : null}
        </div>

        <Popover.Content
          dir="rtl"
          align="start"
          className="bg-ui-bg-base shadow-elevation-flyout w-[286px] rounded-lg p-3"
          data-testid="jalali-date-picker-content"
        >
          <div className="mb-2 flex items-center justify-between">
            {/* Arrows point at calendar direction, not reading direction: in
                this RTL grid "previous" sits on the right. */}
            <button
              type="button"
              aria-label={t("jalaliDatePicker.next")}
              className="text-ui-fg-subtle hover:bg-ui-bg-base-hover flex size-7 items-center justify-center rounded-md outline-none"
              onClick={() => step(1)}
            >
              <ChevronLeft />
            </button>

            <button
              type="button"
              data-testid="jalali-date-picker-view-toggle"
              className="txt-compact-small-plus text-ui-fg-base hover:bg-ui-bg-base-hover rounded-md px-2 py-1 outline-none"
              onClick={() =>
                setView((v) =>
                  v === "day" ? "month" : v === "month" ? "year" : "day"
                )
              }
            >
              {headerTitle}
            </button>

            <button
              type="button"
              aria-label={t("jalaliDatePicker.previous")}
              className="text-ui-fg-subtle hover:bg-ui-bg-base-hover flex size-7 items-center justify-center rounded-md outline-none"
              onClick={() => step(-1)}
            >
              <ChevronRight />
            </button>
          </div>

          {view === "day" && (
            <>
              <div className="mb-1 grid grid-cols-7">
                {JALALI_WEEKDAYS_FA.map((d, i) => (
                  <div key={i} className="flex justify-center">
                    <Text size="xsmall" className="text-ui-fg-muted">
                      {d}
                    </Text>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-y-0.5">
                {Array.from({ length: leadingBlanks }).map((_, i) => (
                  <span key={`blank-${i}`} />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1
                  const isSelected =
                    selected?.jy === cursor.jy &&
                    selected?.jm === cursor.jm &&
                    selected?.jd === day
                  const isToday =
                    todayJalali.jy === cursor.jy &&
                    todayJalali.jm === cursor.jm &&
                    todayJalali.jd === day
                  const disabled = isOutOfRange(cursor.jy, cursor.jm, day)

                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={disabled}
                      data-testid={`jalali-day-${day}`}
                      onClick={() => emit(cursor.jy, cursor.jm, day)}
                      className={clx(
                        "txt-compact-small mx-auto flex size-8 items-center justify-center rounded-md outline-none transition-fg",
                        "hover:bg-ui-bg-base-hover",
                        isToday && !isSelected && "text-ui-fg-interactive font-medium",
                        isSelected &&
                          "bg-ui-bg-interactive text-ui-fg-on-color hover:bg-ui-bg-interactive",
                        disabled &&
                          "text-ui-fg-disabled cursor-not-allowed hover:bg-transparent"
                      )}
                    >
                      {toPersianDigits(day)}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {view === "month" && (
            <div className="grid grid-cols-3 gap-1">
              {JALALI_MONTHS_FA.map((name, i) => (
                <button
                  key={name}
                  type="button"
                  data-testid={`jalali-month-${i + 1}`}
                  onClick={() => {
                    setCursor((c) => ({ ...c, jm: i + 1 }))
                    setView("day")
                  }}
                  className={clx(
                    "txt-compact-small hover:bg-ui-bg-base-hover rounded-md px-1 py-2 outline-none transition-fg",
                    cursor.jm === i + 1 &&
                      "bg-ui-bg-interactive text-ui-fg-on-color hover:bg-ui-bg-interactive"
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          {view === "year" && (
            <div className="grid grid-cols-3 gap-1">
              {Array.from({ length: YEARS_PER_PAGE }).map((_, i) => {
                const year = yearPageStart + i
                return (
                  <button
                    key={year}
                    type="button"
                    data-testid={`jalali-year-${year}`}
                    onClick={() => {
                      setCursor((c) => ({ ...c, jy: year }))
                      setView("month")
                    }}
                    className={clx(
                      "txt-compact-small hover:bg-ui-bg-base-hover rounded-md px-1 py-2 outline-none transition-fg",
                      cursor.jy === year &&
                        "bg-ui-bg-interactive text-ui-fg-on-color hover:bg-ui-bg-interactive"
                    )}
                  >
                    {toPersianDigits(year)}
                  </button>
                )
              })}
            </div>
          )}

          {granularity === "minute" && (
            <div className="border-ui-border-base mt-3 flex items-center gap-x-2 border-t pt-3">
              <Text size="xsmall" className="text-ui-fg-subtle">
                {t("jalaliDatePicker.time")}
              </Text>
              <input
                type="time"
                dir="ltr"
                aria-label={t("jalaliDatePicker.time")}
                data-testid="jalali-date-picker-time"
                className="bg-ui-bg-field shadow-borders-base txt-compact-small ms-auto h-7 rounded-md px-2 outline-none focus-visible:shadow-borders-interactive-with-active"
                value={
                  value ? `${pad(value.getHours())}:${pad(value.getMinutes())}` : ""
                }
                onChange={(e) => {
                  const [h, m] = e.target.value.split(":").map(Number)
                  if (!Number.isNaN(h) && !Number.isNaN(m)) {
                    setTime(h, m)
                  }
                }}
              />
            </div>
          )}
        </Popover.Content>
      </Popover>
    )
  }
)

JalaliDatePicker.displayName = "JalaliDatePicker"
