import { useState, type FormEvent } from "react"

import { Alert, Button, Input, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { useRequestOtp, useVerifyOtp } from "@hooks/api"
import { isFetchError } from "@lib/is-fetch-error"

type PhoneAuthFormProps = {
  /** Called after the code is verified and the session is established. */
  onVerified: (phone: string) => void
  /** Label for the final verify button (defaults to a generic "verify"). */
  submitLabel?: string
}

/**
 * Two-step phone (OTP) authentication used by both login and register.
 * Step 1: enter phone -> request a code. Step 2: enter the code -> verify,
 * which sets the session and calls `onVerified`.
 */
export const PhoneAuthForm = ({ onVerified, submitLabel }: PhoneAuthFormProps) => {
  const { t } = useTranslation()

  const [step, setStep] = useState<"phone" | "code">("phone")
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)

  const { mutateAsync: requestOtp, isPending: isRequesting } = useRequestOtp()
  const { mutateAsync: verifyOtp, isPending: isVerifying } = useVerifyOtp()

  const toError = (e: unknown) =>
    isFetchError(e) || e instanceof Error ? (e as Error).message : String(e)

  const handleRequest = async () => {
    setError(null)
    const value = phone.trim()
    if (!value) {
      setError(t("login.phone.validation.phoneRequired"))
      return
    }
    try {
      await requestOtp({ phone: value })
      setStep("code")
    } catch (e) {
      setError(toError(e))
    }
  }

  const handleVerify = async () => {
    setError(null)
    const value = code.trim()
    if (!value) {
      setError(t("login.phone.validation.codeRequired"))
      return
    }
    try {
      await verifyOtp({ phone: phone.trim(), code: value })
      onVerified(phone.trim())
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
            <button
              type="button"
              onClick={() => {
                setStep("phone")
                setCode("")
                setError(null)
              }}
              className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover self-start text-left text-xs font-medium outline-none transition-fg"
            >
              {t("login.phone.changeNumber")}
            </button>
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
