/*
 * Accept Persian (۰-۹) and Arabic-Indic (٠-٩) digits in numeric inputs.
 *
 * Native `<input type="number">` hard-rejects non-ASCII digits before any React
 * change event fires, so the value silently stays empty. We intercept at the
 * keydown/paste level (capture phase) and substitute the ASCII digit, then
 * dispatch a native `input` event so React Hook Form / controlled inputs pick it
 * up. In-source replacement for the host-side global handler. Language-
 * independent (only fires when a Persian/Arabic digit is actually typed/pasted).
 */
const DIGIT_MAP: Record<string, string> = {
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
}

const toAscii = (s: string) => s.replace(/[۰-۹٠-٩]/g, (d) => DIGIT_MAP[d] ?? d)

const isEditable = (
  el: EventTarget | null
): el is HTMLInputElement | HTMLTextAreaElement =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement

// React overrides the value setter on inputs; call the *native* setter so the
// framework's onChange still sees the update when we dispatch `input`.
const nativeSetter = (
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string
) => {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  const desc = Object.getOwnPropertyDescriptor(proto, "value")
  desc?.set?.call(el, value)
  el.dispatchEvent(new Event("input", { bubbles: true }))
}

const insert = (el: HTMLInputElement | HTMLTextAreaElement, text: string) => {
  // type="number" inputs don't expose selection APIs — append instead of
  // splicing at the caret (fine for left-to-right numeric entry).
  const isNumber = el instanceof HTMLInputElement && el.type === "number"
  if (isNumber || el.selectionStart == null) {
    nativeSetter(el, (el.value ?? "") + text)
    return
  }
  const start = el.selectionStart
  const end = el.selectionEnd ?? start
  const next = el.value.slice(0, start) + text + el.value.slice(end)
  nativeSetter(el, next)
  const pos = start + text.length
  el.setSelectionRange(pos, pos)
}

const FLAG = "__persianDigitInputInstalled__"

export const installPersianDigitInput = () => {
  if (typeof document === "undefined") {
    return
  }
  const w = window as unknown as Record<string, boolean>
  if (w[FLAG]) {
    return
  }
  w[FLAG] = true

  document.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (!(e.key in DIGIT_MAP)) return
      if (!isEditable(e.target)) return
      e.preventDefault()
      insert(e.target, DIGIT_MAP[e.key])
    },
    true
  )

  document.addEventListener(
    "paste",
    (e: ClipboardEvent) => {
      if (!isEditable(e.target)) return
      const text = e.clipboardData?.getData("text") ?? ""
      if (!/[۰-۹٠-٩]/.test(text)) return
      e.preventDefault()
      insert(e.target, toAscii(text))
    },
    true
  )
}
