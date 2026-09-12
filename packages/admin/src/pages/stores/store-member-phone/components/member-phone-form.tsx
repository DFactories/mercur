import { zodResolver } from "@hookform/resolvers/zod";
import i18n from "i18next";
import { Button, Input, Text, toast } from "@medusajs/ui";
import { iranMobileSchema } from "@mercurjs/dashboard-shared";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import * as zod from "zod";

import { Form } from "../../../../components/common/form";
import { RouteDrawer, useRouteModal } from "../../../../components/modals";
import { KeyboundForm } from "../../../../components/utilities/keybound-form";
import { useUpdateMemberPhone } from "../../../../hooks/api/members";

const MemberPhoneSchema = zod.object({
  phone: iranMobileSchema(
    i18n.t("stores.members.phone.validation.phoneInvalid"),
    i18n.t("stores.members.phone.validation.phoneRequired"),
  ),
});

type MemberPhoneFormProps = {
  memberId: string;
  currentPhone: string | null;
};

export const MemberPhoneForm = ({
  memberId,
  currentPhone,
}: MemberPhoneFormProps) => {
  const { t } = useTranslation();
  const { handleSuccess } = useRouteModal();

  const form = useForm<zod.infer<typeof MemberPhoneSchema>>({
    defaultValues: { phone: currentPhone ?? "" },
    mode: "onSubmit",
    reValidateMode: "onSubmit",
    resolver: zodResolver(MemberPhoneSchema),
  });

  const { mutateAsync, isPending } = useUpdateMemberPhone(memberId);

  // The route answers with codes, not sentences — the operator panel has no
  // global translator for backend errors, so the three it can return are
  // mapped here.
  const mapError = (message: string) => {
    if (message.includes("PHONE_ALREADY_REGISTERED")) {
      return t("stores.members.phone.errors.alreadyRegistered");
    }
    if (message.includes("PHONE_UNCHANGED")) {
      return t("stores.members.phone.errors.unchanged");
    }
    if (message.includes("INVALID_PHONE")) {
      return t("stores.members.phone.validation.phoneInvalid");
    }
    return message;
  };

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      const result = await mutateAsync({ phone: values.phone });

      toast.success(
        result?.login_identity_updated
          ? t("stores.members.phone.successToast", { phone: values.phone })
          : // Saved, but this member had no phone sign-in to move — say so
            // rather than promise them a login they do not have.
            t("stores.members.phone.savedNoLoginToast", {
              phone: values.phone,
            }),
      );
      handleSuccess();
    } catch (error) {
      form.setError("phone", {
        type: "manual",
        message: mapError((error as Error).message),
      });
    }
  });

  return (
    <RouteDrawer.Form form={form}>
      <KeyboundForm onSubmit={handleSubmit} className="flex flex-1 flex-col">
        <RouteDrawer.Body>
          <div className="flex flex-col gap-y-4">
            <Text size="small" className="text-ui-fg-subtle">
              {t("stores.members.phone.description")}
            </Text>
            <Form.Field
              control={form.control}
              name="phone"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>{t("stores.members.phone.label")}</Form.Label>
                  <Form.Control>
                    <Input
                      type="tel"
                      inputMode="tel"
                      dir="ltr"
                      placeholder="09xxxxxxxxx"
                      autoComplete="tel"
                      {...field}
                      data-testid="member-phone-input"
                    />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
          </div>
        </RouteDrawer.Body>
        <RouteDrawer.Footer>
          <div className="flex items-center justify-end gap-x-2">
            <RouteDrawer.Close asChild>
              <Button size="small" variant="secondary">
                {t("actions.cancel")}
              </Button>
            </RouteDrawer.Close>
            <Button
              size="small"
              type="submit"
              isLoading={isPending}
              data-testid="member-phone-submit"
            >
              {t("actions.save")}
            </Button>
          </div>
        </RouteDrawer.Footer>
      </KeyboundForm>
    </RouteDrawer.Form>
  );
};
