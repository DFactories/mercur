/*
 * Persian (fa) error map for Zod.
 *
 * Form validation messages across the panel — both our own custom forms and the
 * compiled @mercurjs/vendor bundle's forms (login, register, onboarding, …) —
 * come from Zod's default English messages. Zod resolves to a single shared
 * instance in this workspace (deduped 3.25.76), so registering ONE global error
 * map here translates validation errors everywhere.
 *
 * It is language-aware: when the active language isn't Persian we return Zod's
 * own default message, so English (or any future locale) is left untouched.
 */
import { z } from "zod"
import i18n from "i18next"

const fa = (issue: z.ZodIssueOptionalMessage, ctx: { defaultError: string }) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === "undefined" || issue.received === "null") {
        return "این فیلد الزامی است"
      }
      return `نوع نامعتبر؛ ${issue.expected} انتظار می‌رفت`

    case z.ZodIssueCode.too_small: {
      const min = issue.minimum
      if (issue.type === "string") {
        if (min === 1) return "این فیلد الزامی است"
        return `باید حداقل ${min} کاراکتر باشد`
      }
      if (issue.type === "number") return `باید حداقل ${min} باشد`
      if (issue.type === "array") return `باید حداقل ${min} مورد باشد`
      return "مقدار بسیار کوچک است"
    }

    case z.ZodIssueCode.too_big: {
      const max = issue.maximum
      if (issue.type === "string") return `باید حداکثر ${max} کاراکتر باشد`
      if (issue.type === "number") return `باید حداکثر ${max} باشد`
      if (issue.type === "array") return `باید حداکثر ${max} مورد باشد`
      return "مقدار بسیار بزرگ است"
    }

    case z.ZodIssueCode.invalid_string: {
      if (issue.validation === "email") return "نشانی ایمیل نامعتبر است"
      if (issue.validation === "url") return "نشانی اینترنتی نامعتبر است"
      if (issue.validation === "uuid") return "شناسه نامعتبر است"
      return "قالب نامعتبر است"
    }

    case z.ZodIssueCode.invalid_enum_value:
      return "گزینه نامعتبر است"

    case z.ZodIssueCode.not_multiple_of:
      return "مقدار نامعتبر است"

    case z.ZodIssueCode.invalid_date:
      return "تاریخ نامعتبر است"

    default:
      return ctx.defaultError
  }
}

export const installZodErrorMap = () => {
  z.setErrorMap((issue, ctx) => {
    if (i18n.language !== "fa") {
      return { message: ctx.defaultError }
    }
    return { message: fa(issue, ctx) }
  })
}
