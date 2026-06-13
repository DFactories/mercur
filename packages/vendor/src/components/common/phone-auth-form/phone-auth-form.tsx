import { useEffect, useState, type FormEvent } from "react"

import { Alert, Button, Input, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { useRequestOtp, useVerifyOtp } from "@hooks/api"
import { isFetchError } from "@lib/is-fetch-error"

type PhoneAuthFormProps = {
  /** Called after the code is verified and the session is established. */
  onVerified: (phone: string) => void
  /** Label for the final verify button (defaults to a generic "verify"). */
  submitLabel?: string
  /**
   * "login" requires the phone to already have an account; "register" requires
   * it not to. Drives the backend pre-send check.
   */
  mode?: "login" | "register"
}

const RESEND_SECONDS = 60

/** Iranian mobile: 09 + 9 digits = 11 digits. */
const IRAN_MOBILE_RE = /^09\d{9}$/

/** Mirror the backend normalization so client validation matches. */
const normalizePhone = (input: string): string => {
  let p = input.replace(/[\s-]/g, "")
  if (p.startsWith("+98")) {
    p = "0" + p.slice(3)
  } else if (p.startsWith("0098")) {
    p = "0" + p.slice(4)
  } else if (p.startsWith("98") && p.length === 12) {
    p = "0" + p.slice(2)
  }
  return p
}

/**
 * Two-step phone (OTP) authentication used by both login and register.
 * Step 1: enter phone -> request a code. Step 2: enter the code -> verify,
 * which sets the session and calls `onVerified`. Includes a resend-with-cooldown.
 */
export const PhoneAuthForm = ({
  onVerified,
  submitLabel,
  mode,
}: PhoneAuthFormProps) => {
  const { t } = useTranslation()

  const [step, setStep] = useState<"phone" | "code">("phone")
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)

  const { mutateAsync: requestOtp, isPending: isRequesting } = useRequestOtp()
  const { mutateAsync: verifyOtp, isPending: isVerifying } = useVerifyOtp()

  // Countdown for the resend button.
  useEffect(() => {
    if (resendIn <= 0) {
      return
    }
    const id = setTimeout(() => setResendIn(resendIn - 1), 1000)
    return () => clearTimeout(id)
  }, [resendIn])

  const mapError = (msg?: string): string | undefined => {
    if (!msg) {
      return msg
    }
    if (msg.includes("PHONE_NOT_REGISTERED")) {
      return t("login.phone.errors.notRegistered")
    }
    if (msg.includes("PHONE_ALREADY_REGISTERED")) {
      return t("login.phone.errors.alreadyRegistered")
    }
    if (msg.includes("INVALID_PHONE")) {
      return t("login.phone.validation.phoneInvalid")
    }
    return msg
  }

  const toError = (e: unknown) =>
    mapError(
      isFetchError(e) || e instanceof Error ? (e as Error).message : String(e)
    ) ?? null

  const sendCode = async () => {
    await requestOtp({ phone: normalizePhone(phone), mode })
    setResendIn(RESEND_SECONDS)
  }

  const handleRequest = async () => {
    setError(null)
    const normalized = normalizePhone(phone)
    if (!normalized) {
      setError(t("login.phone.validation.phoneRequired"))
      return
    }
    if (!IRAN_MOBILE_RE.test(normalized)) {
      setError(t("login.phone.validation.phoneInvalid"))
      return
    }
    try {
      await sendCode()
      setStep("code")
    } catch (e) {
      setError(toError(e))
    }
  }

  const handleResend = async () => {
    if (resendIn > 0) {
      return
    }
    setError(null)
    setCode("")
    try {
      await sendCode()
    } catch (e) {
      setError(toError(e))
    }
  }

  const handleVerify = async () => {
    setError(null)
    if (!code.trim()) {
      setError(t("login.phone.validation.codeRequired"))
      return
    }
    try {
      await verifyOtp({ phone: normalizePhone(phone), code: code.trim() })
      onVerified(normalizePhone(phone))
    } catch (e) {
      setError(toError(e))
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (step === "phone") {
      void handleRequest()
    } else {
      void handleVerify()
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-y-6">
      <div className="flex flex-col gap-y-4">
        <div className="flex flex-col gap-y-2">
          <Text size="small" weight="plus">
            {t("fields.phone")}
          </Text>
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            placeholder="09xxxxxxxxx"
            value={phone}
            disabled={step === "code"}
            onChange={(e) => setPhone(e.target.value)}
            data-testid="phone-input"
          />
        </div>

        {step === "code" && (
          <div className="flex flex-col gap-y-2">
            <Text size="small" weight="plus">
              {t("login.phone.codeLabel")}
            </Text>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              dir="ltr"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              data-testid="otp-input"
            />
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setStep("phone")
                  setCode("")
                  setError(null)
                  setResendIn(0)
                }}
                className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover text-left text-xs font-medium outline-none transition-fg"
              >
                {t("login.phone.changeNumber")}
              </button>
              {resendIn > 0 ? (
                <Text size="xsmall" className="text-ui-fg-muted">
                  {t("login.phone.resendIn", { seconds: resendIn })}
                </Text>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={isRequesting}
                  className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover text-xs font-medium outline-none transition-fg disabled:opacity-50"
                  data-testid="resend-code"
                >
                  {t("login.phone.resend")}
                </button>
              )}
            </div>
          </div>
        )}

        {error && (
          <Alert
            className="bg-ui-bg-base items-center p-2"
            dismissible
            variant="error"
          >
            {error}
          </Alert>
        )}
      </div>

      <Button
        className="w-full"
        type="submit"
        isLoading={isRequesting || isVerifying}
        data-testid="phone-submit"
      >
        {step === "phone"
          ? t("login.phone.sendCode")
          : submitLabel ?? t("login.phone.verify")}
      </Button>
    </form>
  )
}
