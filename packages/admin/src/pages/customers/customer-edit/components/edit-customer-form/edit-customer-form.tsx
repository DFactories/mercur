import i18n from "i18next"
import { HttpTypes } from "@medusajs/types"
import { Button, Input, toast } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import * as zod from "zod"
import {
  FormExtensionZone,
  normalizeIranPhone,
  optionalIranMobileSchema,
  useExtendableForm,
} from "@mercurjs/dashboard-shared"
import { ConditionalTooltip } from "../../../../../components/common/conditional-tooltip/index.ts"
import { Form } from "../../../../../components/common/form/index.ts"
import {
  RouteDrawer,
  useRouteModal,
} from "../../../../../components/modals/index.ts"
import { KeyboundForm } from "../../../../../components/utilities/keybound-form/keybound-form.tsx"
import {
  useUpdateCustomer,
  useUpdateCustomerPhone,
} from "../../../../../hooks/api/customers.tsx"

type EditCustomerFormProps = {
  customer: HttpTypes.AdminCustomer
}

const EditCustomerSchema = zod.object({
  // Optional: a shopper who signed up with their phone has no email, and a
  // required one made this drawer impossible to submit for exactly those
  // accounts — including to fix the phone number itself.
  email: zod
    .string()
    .email({ message: i18n.t("customers.validation.emailInvalid") })
    .optional()
    .or(zod.literal("")),
  first_name: zod.string().optional(),
  last_name: zod.string().optional(),
  company_name: zod.string().optional(),
  phone: optionalIranMobileSchema(
    i18n.t("customers.validation.phoneInvalid")
  ),
})

export const EditCustomerForm = ({ customer }: EditCustomerFormProps) => {
  const { t } = useTranslation()
  const { handleSuccess } = useRouteModal()
  
  const form = useExtendableForm({
    schema: EditCustomerSchema,
    model: "customer",
    zone: "edit",
    data: customer,
    defaultValues: {
      email: customer.email || "",
      first_name: customer.first_name || "",
      last_name: customer.last_name || "",
      company_name: customer.company_name || "",
      phone: customer.phone || "",
    },
  })

  const { mutateAsync, isPending } = useUpdateCustomer(customer.id)
  const { mutateAsync: updatePhone, isPending: isPhonePending } =
    useUpdateCustomerPhone(customer.id)

  // The phone route answers with codes, not sentences — the backend has no
  // language, and this panel (unlike the vendor one) has no global translator
  // for API errors, so the two it can actually return are mapped here.
  const mapPhoneError = (message: string) => {
    if (message.includes("PHONE_ALREADY_REGISTERED")) {
      return t("customers.validation.phoneTaken")
    }
    if (message.includes("INVALID_PHONE")) {
      return t("customers.validation.phoneInvalid")
    }
    return message
  }

  const handleSubmit = form.handleSubmit(async (data) => {
    const nextPhone = data.phone || ""
    const phoneChanged =
      nextPhone !== "" &&
      nextPhone !== normalizeIranPhone(customer.phone ?? "")

    try {
      // First, because it is the one that can be refused (the number may
      // already open someone else's account) — and a refusal should leave the
      // whole save undone rather than half-applied.
      if (phoneChanged) {
        await updatePhone({ phone: nextPhone })
      }

      await mutateAsync({
        email: customer.has_account ? undefined : data.email || undefined,
        first_name: data.first_name || undefined,
        last_name: data.last_name || undefined,
        // Never here: the phone travels through its own route, which moves the
        // sign-in identity with it.
        company_name: data.company_name || undefined,
      })

      toast.success(
        t("customers.edit.successToast", {
          // A phone-only shopper has no email to name them by.
          email: customer.email || nextPhone || customer.phone || customer.id,
        })
      )

      handleSuccess()
    } catch (error) {
      toast.error(mapPhoneError((error as Error).message))
    }
  })

  return (
    <RouteDrawer.Form form={form} data-testid="edit-customer-form">
      <KeyboundForm onSubmit={handleSubmit} className="flex flex-1 flex-col" data-testid="edit-customer-form-keybound">
        <RouteDrawer.Body data-testid="edit-customer-form-body">
          <div className="flex flex-col gap-y-4" data-testid="edit-customer-form-fields">
            <Form.Field
              control={form.control}
              name="email"
              render={({ field }) => {
                return (
                  <Form.Item data-testid="edit-customer-form-email-item">
                    <Form.Label optional data-testid="edit-customer-form-email-label">{t("fields.email")}</Form.Label>
                    <Form.Control data-testid="edit-customer-form-email-control">
                      <ConditionalTooltip
                        showTooltip={customer.has_account}
                        content={t("customers.edit.emailDisabledTooltip")}
                      >
                        <Input {...field} disabled={customer.has_account} data-testid="edit-customer-form-email-input" />
                      </ConditionalTooltip>
                    </Form.Control>
                    <Form.ErrorMessage data-testid="edit-customer-form-email-error" />
                  </Form.Item>
                )
              }}
            />
            <Form.Field
              control={form.control}
              name="first_name"
              render={({ field }) => {
                return (
                  <Form.Item data-testid="edit-customer-form-first-name-item">
                    <Form.Label data-testid="edit-customer-form-first-name-label">{t("fields.firstName")}</Form.Label>
                    <Form.Control data-testid="edit-customer-form-first-name-control">
                      <Input {...field} data-testid="edit-customer-form-first-name-input" />
                    </Form.Control>
                    <Form.ErrorMessage data-testid="edit-customer-form-first-name-error" />
                  </Form.Item>
                )
              }}
            />
            <Form.Field
              control={form.control}
              name="last_name"
              render={({ field }) => {
                return (
                  <Form.Item data-testid="edit-customer-form-last-name-item">
                    <Form.Label data-testid="edit-customer-form-last-name-label">{t("fields.lastName")}</Form.Label>
                    <Form.Control data-testid="edit-customer-form-last-name-control">
                      <Input {...field} data-testid="edit-customer-form-last-name-input" />
                    </Form.Control>
                    <Form.ErrorMessage data-testid="edit-customer-form-last-name-error" />
                  </Form.Item>
                )
              }}
            />
            <Form.Field
              control={form.control}
              name="company_name"
              render={({ field }) => {
                return (
                  <Form.Item data-testid="edit-customer-form-company-name-item">
                    <Form.Label data-testid="edit-customer-form-company-name-label">{t("fields.company")}</Form.Label>
                    <Form.Control data-testid="edit-customer-form-company-name-control">
                      <Input {...field} data-testid="edit-customer-form-company-name-input" />
                    </Form.Control>
                    <Form.ErrorMessage data-testid="edit-customer-form-company-name-error" />
                  </Form.Item>
                )
              }}
            />
            <Form.Field
              control={form.control}
              name="phone"
              render={({ field }) => {
                return (
                  <Form.Item data-testid="edit-customer-form-phone-item">
                    <Form.Label optional data-testid="edit-customer-form-phone-label">{t("fields.phone")}</Form.Label>
                    <Form.Control data-testid="edit-customer-form-phone-control">
                      <Input
                        type="tel"
                        inputMode="tel"
                        dir="ltr"
                        placeholder="09xxxxxxxxx"
                        {...field}
                        data-testid="edit-customer-form-phone-input"
                      />
                    </Form.Control>
                    <Form.ErrorMessage data-testid="edit-customer-form-phone-error" />
                  </Form.Item>
                )
              }}
            />
            <FormExtensionZone
              model="customer"
              zone="edit"
              control={form.control}
              data={customer}
            />
          </div>
        </RouteDrawer.Body>
        <RouteDrawer.Footer data-testid="edit-customer-form-footer">
          <div className="flex items-center justify-end gap-x-2" data-testid="edit-customer-form-footer-actions">
            <RouteDrawer.Close asChild>
              <Button variant="secondary" size="small" data-testid="edit-customer-form-cancel-button">
                {t("actions.cancel")}
              </Button>
            </RouteDrawer.Close>
            <Button
              isLoading={isPending || isPhonePending}
              type="submit"
              variant="primary"
              size="small"
              data-testid="edit-customer-form-submit-button"
            >
              {t("actions.save")}
            </Button>
          </div>
        </RouteDrawer.Footer>
      </KeyboundForm>
    </RouteDrawer.Form>
  )
}
