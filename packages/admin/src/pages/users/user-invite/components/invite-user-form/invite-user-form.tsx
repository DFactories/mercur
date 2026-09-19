import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowPath, Link, Trash } from "@medusajs/icons";
import { HttpTypes } from "@medusajs/types";
import {
  Alert,
  Button,
  Container,
  Heading,
  Input,
  Select,
  StatusBadge,
  Text,
  Tooltip,
  usePrompt,
} from "@medusajs/ui";
import { createColumnHelper } from "@tanstack/react-table";
import copy from "copy-to-clipboard";
import { format } from "date-fns";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { Trans, useTranslation } from "react-i18next";
import * as zod from "zod";
import { ActionMenu } from "../../../../../components/common/action-menu/index.ts";
import { Form } from "../../../../../components/common/form/index.ts";
import { RouteFocusModal } from "../../../../../components/modals/index.ts";
import { _DataTable } from "../../../../../components/table/data-table/index.ts";
import { KeyboundForm } from "../../../../../components/utilities/keybound-form/keybound-form.tsx";
import {
  useCreateInvite,
  useDeleteInvite,
  useInvites,
  useResendInvite,
} from "../../../../../hooks/api/invites.tsx";
import { useAssignableRoles } from "../../../../../hooks/api/rbac-roles.ts";
import { useUserInviteTableQuery } from "../../../../../hooks/table/query/use-user-invite-table-query.tsx";
import { useDataTable } from "../../../../../hooks/use-data-table.tsx";
import { isFetchError } from "../../../../../lib/is-fetch-error.ts";

/**
 * A role is REQUIRED, and that is the whole point of this change.
 *
 * An invite with no role creates an admin who is refused by every admin route
 * — including the store lookup the panel shell itself performs — so they
 * cannot use the product at all. Before RBAC enforcement that was harmless;
 * now it is a lockout, and it is what a real new admin hit. The server refuses
 * such an invite too (`api/admin/invites/middlewares.ts` in dfactories-mp);
 * this is so the super-admin is asked rather than rejected.
 */
const InviteUserSchema = zod.object({
  email: zod.string().email(),
  role_id: zod.string().min(1),
});

const PAGE_SIZE = 10;
const PREFIX = "usr_invite";
const getBaseUrl = () => {
  try {
    const base = typeof __BASE__ !== "undefined" ? __BASE__ : "/"
    return base === "/" ? "" : base
  } catch {
    return ""
  }
}

const INVITE_URL = `${window.location.origin}${getBaseUrl()}/invite?token=`;

export const InviteUserForm = () => {
  const { t } = useTranslation();

  const form = useForm<zod.infer<typeof InviteUserSchema>>({
    defaultValues: {
      email: "",
      role_id: "",
    },
    resolver: zodResolver(InviteUserSchema),
  });

  const { raw, searchParams } = useUserInviteTableQuery({
    prefix: PREFIX,
    pageSize: PAGE_SIZE,
  });

  const {
    invites,
    count,
    isPending: isLoading,
    isError,
    error,
  } = useInvites(searchParams);

  const columns = useColumns();

  const { table } = useDataTable({
    data: invites ?? [],
    columns,
    count,
    enablePagination: true,
    getRowId: (row) => row.id,
    pageSize: PAGE_SIZE,
    prefix: PREFIX,
  });

  const { mutateAsync, isPending } = useCreateInvite();
  // Only roles this admin may actually grant — the server scopes the list, so
  // nobody is offered a role they would then be refused for choosing.
  const { roles: assignableRoles } = useAssignableRoles();

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      await mutateAsync({ email: values.email, roles: [values.role_id] });
      form.reset();
    } catch (error) {
      if (isFetchError(error) && error.status === 400) {
        form.setError("root", {
          type: "manual",
          message: error.message,
        });
        return;
      }
    }
  });

  if (isError) {
    throw error;
  }

  return (
    <RouteFocusModal.Form form={form} data-testid="user-invite-form">
      <KeyboundForm
        onSubmit={handleSubmit}
        className="flex h-full flex-col overflow-hidden"
      >
        <RouteFocusModal.Header data-testid="user-invite-form-header" />
        <RouteFocusModal.Body
          className="flex flex-1 flex-col overflow-hidden"
          data-testid="user-invite-form-body"
        >
          <div className="flex flex-1 flex-col items-center overflow-y-auto">
            <div className="flex w-full max-w-[720px] flex-col gap-y-8 px-2 py-16">
              <div data-testid="user-invite-form-header-section">
                <Heading data-testid="user-invite-form-heading">
                  {t("users.inviteUser")}
                </Heading>
                <Text
                  size="small"
                  className="text-ui-fg-subtle"
                  data-testid="user-invite-form-hint"
                >
                  {t("users.inviteUserHint")}
                </Text>
              </div>

              {form.formState.errors.root && (
                <Alert
                  variant="error"
                  dismissible={false}
                  className="text-balance"
                  data-testid="user-invite-form-error-alert"
                >
                  {form.formState.errors.root.message}
                </Alert>
              )}

              <div
                className="flex flex-col gap-y-4"
                data-testid="user-invite-form-email-section"
              >
                <div className="grid grid-cols-2 gap-4">
                  <Form.Field
                    control={form.control}
                    name="email"
                    render={({ field }) => {
                      return (
                        <Form.Item data-testid="user-invite-form-email-item">
                          <Form.Label data-testid="user-invite-form-email-label">
                            {t("fields.email")}
                          </Form.Label>
                          <Form.Control data-testid="user-invite-form-email-control">
                            <Input
                              {...field}
                              data-testid="user-invite-form-email-input"
                            />
                          </Form.Control>
                          <Form.ErrorMessage data-testid="user-invite-form-email-error" />
                        </Form.Item>
                      );
                    }}
                  />
                  <Form.Field
                    control={form.control}
                    name="role_id"
                    render={({ field: { onChange, ref, ...field } }) => {
                      return (
                        <Form.Item data-testid="user-invite-form-role-item">
                          <Form.Label data-testid="user-invite-form-role-label">
                            {t("fields.role")}
                          </Form.Label>
                          <Form.Control data-testid="user-invite-form-role-control">
                            <Select {...field} onValueChange={onChange}>
                              <Select.Trigger
                                ref={ref}
                                data-testid="user-invite-form-role-trigger"
                              >
                                <Select.Value />
                              </Select.Trigger>
                              <Select.Content>
                                {assignableRoles.map((role) => (
                                  <Select.Item key={role.id} value={role.id}>
                                    {role.name}
                                  </Select.Item>
                                ))}
                              </Select.Content>
                            </Select>
                          </Form.Control>
                          <Form.ErrorMessage data-testid="user-invite-form-role-error" />
                        </Form.Item>
                      );
                    }}
                  />
                </div>
                <div className="flex items-center justify-end">
                  <Button
                    size="small"
                    variant="secondary"
                    type="submit"
                    isLoading={isPending}
                    data-testid="user-invite-form-send-invite-button"
                  >
                    {t("users.sendInvite")}
                  </Button>
                </div>
              </div>
              <div
                className="flex flex-col gap-y-4"
                data-testid="user-invite-form-pending-invites-section"
              >
                <Heading
                  level="h2"
                  data-testid="user-invite-form-pending-invites-heading"
                >
                  {t("users.pendingInvites")}
                </Heading>
                <Container className="overflow-hidden p-0">
                  <_DataTable
                    table={table}
                    columns={columns}
                    count={count}
                    pageSize={PAGE_SIZE}
                    pagination
                    search="autofocus"
                    isLoading={isLoading}
                    queryObject={raw}
                    prefix={PREFIX}
                    orderBy={[
                      { key: "email", label: t("fields.email") },
                      { key: "created_at", label: t("fields.createdAt") },
                      { key: "updated_at", label: t("fields.updatedAt") },
                    ]}
                    data-testid="user-invite-form-pending-invites-table"
                  />
                </Container>
              </div>
            </div>
          </div>
        </RouteFocusModal.Body>
      </KeyboundForm>
    </RouteFocusModal.Form>
  );
};

const InviteActions = ({ invite }: { invite: HttpTypes.AdminInvite }) => {
  const { mutateAsync: revokeAsync } = useDeleteInvite(invite.id);
  const { mutateAsync: resendAsync } = useResendInvite(invite.id);

  const prompt = usePrompt();
  const { t } = useTranslation();

  const handleDelete = async () => {
    const res = await prompt({
      title: t("general.areYouSure"),
      description: t("users.deleteInviteWarning", {
        email: invite.email,
      }),
      cancelText: t("actions.cancel"),
      confirmText: t("actions.delete"),
    });

    if (!res) {
      return;
    }

    await revokeAsync();
  };

  const handleResend = async () => {
    await resendAsync();
  };

  const handleCopyInviteLink = () => {
    const inviteUrl = `${INVITE_URL}${invite.token}`;
    copy(inviteUrl);
  };

  return (
    <ActionMenu
      groups={[
        {
          actions: [
            {
              icon: <ArrowPath />,
              label: t("users.resendInvite"),
              onClick: handleResend,
            },
          ],
        },
        {
          actions: [
            {
              icon: <Link />,
              label: t("users.copyInviteLink"),
              onClick: handleCopyInviteLink,
            },
          ],
        },
        {
          actions: [
            {
              icon: <Trash />,
              label: t("actions.delete"),
              onClick: handleDelete,
            },
          ],
        },
      ]}
      data-testid={`user-invite-form-invite-action-menu-${invite.id}`}
    />
  );
};

const columnHelper = createColumnHelper<HttpTypes.AdminInvite>();

const useColumns = () => {
  const { t } = useTranslation();

  return useMemo(
    () => [
      columnHelper.accessor("email", {
        header: t("fields.email"),
        cell: ({ getValue }) => {
          return getValue();
        },
      }),
      columnHelper.accessor("accepted", {
        header: t("fields.status"),
        cell: ({ getValue, row }) => {
          const accepted = getValue();
          const expired = new Date(row.original.expires_at) < new Date();

          if (accepted) {
            return (
              <Tooltip
                content={t("users.acceptedOnDate", {
                  date: format(
                    new Date(row.original.updated_at),
                    "dd MMM, yyyy",
                  ),
                })}
              >
                <StatusBadge color="green">
                  {t("users.inviteStatus.accepted")}
                </StatusBadge>
              </Tooltip>
            );
          }

          if (expired) {
            return (
              <Tooltip
                content={t("users.expiredOnDate", {
                  date: format(
                    new Date(row.original.expires_at),
                    "dd MMM, yyyy",
                  ),
                })}
              >
                <StatusBadge color="red">
                  {t("users.inviteStatus.expired")}
                </StatusBadge>
              </Tooltip>
            );
          }

          return (
            <Tooltip
              content={
                <Trans
                  i18nKey={"users.validFromUntil"}
                  components={[
                    <span key="from" className="font-medium" />,
                    <span key="untill" className="font-medium" />,
                  ]}
                  values={{
                    from: format(
                      new Date(row.original.created_at),
                      "dd MMM, yyyy",
                    ),
                    until: format(
                      new Date(row.original.expires_at),
                      "dd MMM, yyyy",
                    ),
                  }}
                />
              }
            >
              <StatusBadge color="orange">
                {t("users.inviteStatus.pending")}
              </StatusBadge>
            </Tooltip>
          );
        },
      }),
      columnHelper.display({
        id: "actions",
        cell: ({ row }) => <InviteActions invite={row.original} />,
      }),
    ],
    [t],
  );
};
