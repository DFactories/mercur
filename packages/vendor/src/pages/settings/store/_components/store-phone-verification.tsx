import { useEffect, useState } from "react";

import { Badge, Button, FocusModal, Input, Label, Text, toast } from "@medusajs/ui";
import { useTranslation } from "react-i18next";

import { useRequestSellerPhoneOtp, useVerifySellerPhoneOtp } from "@hooks/api";
import { isFetchError } from "@lib/is-fetch-error";

const RESEND_SECONDS = 60;

type StorePhoneVerificationProps = {
  phone: string | null;
  verified: boolean;
};

/**
 * Shows the store phone with a verified/unverified badge. When unverified, the
 * owner can verify it via OTP — the backend auto-verifies (no code) when the
 * store phone is their own login phone.
 */
export const StorePhoneVerification = ({
  phone,
  verified,
}: StorePhoneVerificationProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const request = useRequestSellerPhoneOtp();
  const verify = useVerifySellerPhoneOtp();

  useEffect(() => {
    if (resendIn <= 0) {
      return;
    }
    const id = setTimeout(() => setResendIn(resendIn - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  const mapError = (msg?: string): string => {
    if (!msg) {
      return t("store.phoneVerification.errors.generic");
    }
    if (msg.includes("PHONE_ALREADY_REGISTERED")) {
      return t("store.phoneVerification.errors.alreadyRegistered");
    }
    if (msg.includes("INVALID_PHONE")) {
      return t("store.phoneVerification.errors.phoneInvalid");
    }
    if (msg.includes("PHONE_NOT_SET")) {
      return t("store.phoneVerification.errors.notSet");
    }
    if (msg.toLowerCase().includes("code")) {
      return t("store.phoneVerification.errors.invalidCode");
    }
    return msg;
  };

  const toError = (e: unknown) =>
    mapError(
      isFetchError(e) || e instanceof Error ? (e as Error).message : String(e),
    );

  const start = async () => {
    setError(null);
    try {
      const data = await request.mutateAsync();
      if (data?.verified) {
        toast.success(t("store.phoneVerification.toast.verified"));
        return;
      }
      setCode("");
      setOpen(true);
      setResendIn(RESEND_SECONDS);
      toast.success(t("store.phoneVerification.toast.sent"));
    } catch (e) {
      toast.error(toError(e));
    }
  };

  const submit = async () => {
    setError(null);
    try {
      await verify.mutateAsync({ code });
      toast.success(t("store.phoneVerification.toast.verified"));
      setOpen(false);
      setCode("");
    } catch (e) {
      setError(toError(e));
    }
  };

  if (!phone) {
    return (
      <Text size="small" leading="compact">
        -
      </Text>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Text size="small" leading="compact" dir="ltr">
        {phone}
      </Text>
      {verified ? (
        <Badge size="2xsmall" color="green">
          {t("store.phoneVerification.verified")}
        </Badge>
      ) : (
        <>
          <Badge size="2xsmall" color="orange">
            {t("store.phoneVerification.unverified")}
          </Badge>
          <Button
            size="small"
            variant="secondary"
            onClick={start}
            isLoading={request.isPending}
          >
            {t("store.phoneVerification.verify")}
          </Button>
        </>
      )}

      <FocusModal open={open} onOpenChange={setOpen}>
        <FocusModal.Content>
          <FocusModal.Header />
          <FocusModal.Body className="flex flex-col items-center py-16">
            <div className="flex w-full max-w-sm flex-col gap-y-4">
              <div className="flex flex-col gap-y-1">
                <Text size="large" weight="plus">
                  {t("store.phoneVerification.title")}
                </Text>
                <Text size="small" className="text-ui-fg-subtle">
                  {t("store.phoneVerification.description", { phone })}
                </Text>
              </div>
              <div className="flex flex-col gap-y-2">
                <Label htmlFor="store-otp-code" size="small">
                  {t("store.phoneVerification.codeLabel")}
                </Label>
                <Input
                  id="store-otp-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  dir="ltr"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              {error && (
                <Text size="small" className="text-ui-fg-error">
                  {error}
                </Text>
              )}
              <div className="flex items-center justify-between gap-x-2">
                <Button
                  variant="transparent"
                  size="small"
                  disabled={resendIn > 0 || request.isPending}
                  onClick={start}
                >
                  {resendIn > 0
                    ? t("store.phoneVerification.resendIn", { seconds: resendIn })
                    : t("store.phoneVerification.resend")}
                </Button>
                <Button
                  size="small"
                  onClick={submit}
                  isLoading={verify.isPending}
                  disabled={!code}
                >
                  {t("store.phoneVerification.submit")}
                </Button>
              </div>
            </div>
          </FocusModal.Body>
        </FocusModal.Content>
      </FocusModal>
    </div>
  );
};
