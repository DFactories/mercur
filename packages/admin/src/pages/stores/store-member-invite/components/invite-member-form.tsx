import { zodResolver } from "@hookform/resolvers/zod";
import i18n from "i18next";
import { Button, Input, Select, Text, toast } from "@medusajs/ui";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import * as zod from "zod";

import { Form } from "../../../../components/common/form";
import { RouteDrawer, useRouteModal } from "../../../../components/modals";
import { KeyboundForm } from "../../../../components/utilities/keybound-form";
import { useMembers } from "../../../../hooks/api/members";
import {
  useAddSellerMember,
  useInviteSellerMember,
  useSellerMembers,
} from "../../../../hooks/api/sellers";
import { SellerMemberDTO, SellerRole } from "@mercurjs/types";

const ROLE_OPTIONS = [
  {
    value: SellerRole.SELLER_ADMINISTRATION,
    labelKey: "users.roles.administration",
  },
  {
    value: SellerRole.INVENTORY_MANAGEMENT,
    labelKey: "users.roles.inventoryManagement",
  },
  {
    value: SellerRole.ORDER_MANAGEMENT,
    labelKey: "users.roles.orderManagement",
  },
  { value: SellerRole.ACCOUNTING, labelKey: "users.roles.accounting" },
  { value: SellerRole.SUPPORT, labelKey: "users.roles.support" },
];

/** Iranian mobile: 09 + 9 digits = 11 digits. Mirrors the backend check. */
const IRAN_MOBILE_RE = /^09\d{9}$/;

const normalizePhone = (input: string): string => {
  let p = input.replace(/[\s-]/g, "");
  if (p.startsWith("+98")) p = "0" + p.slice(3);
  else if (p.startsWith("0098")) p = "0" + p.slice(4);
  else if (p.startsWith("98") && p.length === 12) p = "0" + p.slice(2);
  return p;
};

const InviteMemberSchema = zod.object({
  phone: zod
    .string()
    .trim()
    .transform(normalizePhone)
    .refine((v) => IRAN_MOBILE_RE.test(v), {
      message: i18n.t("stores.members.addUser.validation.phoneInvalid"),
    }),
  role_id: zod
    .string()
    .min(1, { message: i18n.t("stores.members.addUser.validation.roleRequired") }),
});

type Member = {
  id: string;
  phone?: string | null;
};

export const InviteMemberForm = () => {
  const { t } = useTranslation();
  const { id } = useParams();
  const { handleSuccess } = useRouteModal();

  const form = useForm<zod.infer<typeof InviteMemberSchema>>({
    defaultValues: {
      phone: "",
      role_id: "",
    },
    mode: "onSubmit",
    reValidateMode: "onSubmit",
    resolver: zodResolver(InviteMemberSchema),
  });

  const phoneValue = form.watch("phone");

  // Look up an existing member by phone so the operator can add them directly
  // instead of sending a fresh invite.
  const { members } = useMembers(
    { q: phoneValue || undefined, limit: 10 },
    { placeholderData: (prev: any) => prev },
  );

  const { seller_members: currentMembers } = useSellerMembers(id!, {
    limit: 100,
    offset: 0,
  });

  const existingMemberIds = useMemo(() => {
    const ids = new Set<string>();
    ((currentMembers as SellerMemberDTO[] | undefined) ?? []).forEach((sm) => {
      if (sm.member_id) {
        ids.add(sm.member_id);
      }
    });
    return ids;
  }, [currentMembers]);

  const { mutateAsync: inviteMember, isPending: isInviting } =
    useInviteSellerMember(id!);
  const { mutateAsync: addMember, isPending: isAdding } = useAddSellerMember(
    id!,
  );

  const isPending = isInviting || isAdding;

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      const matched = ((members as Member[] | undefined) ?? []).find(
        (m) =>
          m.phone &&
          normalizePhone(m.phone) === values.phone &&
          !existingMemberIds.has(m.id),
      );

      if (matched) {
        await addMember({
          member_id: matched.id,
          role_id: values.role_id as SellerRole,
        });
        toast.success(t("stores.members.addUser.addedToast"));
      } else {
        await inviteMember({
          phone: values.phone,
          role_id: values.role_id as SellerRole,
        });
        toast.success(t("stores.members.addUser.invitedToast"));
      }

      handleSuccess();
    } catch (error) {
      toast.error((error as Error).message);
    }
  });

  return (
    <RouteDrawer.Form form={form}>
      <KeyboundForm
        onSubmit={handleSubmit}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <RouteDrawer.Body className="flex flex-col gap-y-6 overflow-y-auto">
          <Text size="small" className="text-ui-fg-subtle">
            {t("stores.members.addUser.hint")}
          </Text>
          <Form.Field
            control={form.control}
            name="phone"
            render={({ field }) => (
              <Form.Item>
                <Form.Label>{t("fields.phone")}</Form.Label>
                <Form.Control>
                  <Input
                    {...field}
                    type="tel"
                    inputMode="tel"
                    dir="ltr"
                    placeholder="09xxxxxxxxx"
                    autoComplete="off"
                  />
                </Form.Control>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
          <Form.Field
            control={form.control}
            name="role_id"
            render={({ field: { onChange, ref, ...field } }) => (
              <Form.Item>
                <Form.Label>{t("fields.role")}</Form.Label>
                <Form.Control>
                  <Select {...field} onValueChange={onChange}>
                    <Select.Trigger ref={ref}>
                      <Select.Value placeholder={t("fields.selectPlaceholder", "Select")} />
                    </Select.Trigger>
                    <Select.Content>
                      {ROLE_OPTIONS.map((role) => (
                        <Select.Item key={role.value} value={role.value}>
                          {t(role.labelKey)}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
                </Form.Control>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
        </RouteDrawer.Body>
        <RouteDrawer.Footer>
          <div className="flex items-center justify-end gap-x-2">
            <RouteDrawer.Close asChild>
              <Button size="small" variant="secondary" type="button">
                {t("actions.cancel")}
              </Button>
            </RouteDrawer.Close>
            <Button size="small" type="submit" isLoading={isPending}>
              {t("actions.save")}
            </Button>
          </div>
        </RouteDrawer.Footer>
      </KeyboundForm>
    </RouteDrawer.Form>
  );
};
