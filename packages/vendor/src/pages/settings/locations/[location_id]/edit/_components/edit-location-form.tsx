import { zodResolver } from "@hookform/resolvers/zod"
import { VendorExtendedAdminStockLocation } from "@custom-types/stock-location"
import { Button, Input, toast } from "@medusajs/ui"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import { Form } from "@components/common/form"
import { CountrySelect } from "@components/inputs/country-select"
import {
  GeoCitySelect,
  GeoProvinceSelect,
  useGeoSelection,
} from "@components/inputs/geo-select"
import { RouteDrawer, useRouteModal } from "@components/modals"
import { KeyboundForm } from "@components/utilities/keybound-form"
import { useUpdateStockLocation } from "@hooks/api/stock-locations"

type EditLocationFormProps = {
  location: VendorExtendedAdminStockLocation
}

const EditLocationSchema = zod.object({
  name: zod.string().min(1),
  address: zod.object({
    address_1: zod.string().min(1),
    address_2: zod.string().optional(),
    country_code: zod.string().min(2).max(2),
    city: zod.string().optional(),
    postal_code: zod.string().optional(),
    province: zod.string().optional(),
    company: zod.string().optional(),
    phone: zod.string().optional(), // TODO: Add validation
  }),
})

export const EditLocationForm = ({ location }: EditLocationFormProps) => {
  const { t } = useTranslation()
  const { handleSuccess } = useRouteModal()

  const form = useForm<zod.infer<typeof EditLocationSchema>>({
    defaultValues: {
      name: location.name,
      address: {
        address_1: location.address?.address_1 || "",
        address_2: location.address?.address_2 || "",
        city: location.address?.city || "",
        company: location.address?.company || "",
        country_code: location.address?.country_code || "",
        phone: location.address?.phone || "",
        postal_code: location.address?.postal_code || "",
        province: location.address?.province || "",
      },
    },
    resolver: zodResolver(EditLocationSchema),
  })

  // DFACTORIES: the location's province and city come from the admin-managed
  // geography catalog, not free text — the same catalog the store address and
  // the onboarding wizard read. A location is what shipping is priced FROM, and
  // freight here is quoted city to city, so a typo or an alternate spelling
  // leaves the location unmatchable rather than merely untidy.
  const { provinces, selectedProvince, cities } = useGeoSelection(
    form.watch("address.province")
  )

  const { mutateAsync, isPending } = useUpdateStockLocation(location.id)

  const handleSubmit = form.handleSubmit(async (values) => {
    const { name, address } = values

    await mutateAsync(
      {
        name: name,
        address: address,
      },
      {
        onSuccess: () => {
          toast.success(t("locations.toast.update"))
          handleSuccess()
        },
        onError: (e) => {
          toast.error(e.message)
        },
      }
    )
  })

  return (
    <RouteDrawer.Form form={form}>
      <KeyboundForm
        onSubmit={handleSubmit}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <RouteDrawer.Body className="flex flex-col gap-y-8 overflow-y-auto">
          <div className="grid grid-cols-1 gap-4">
            <Form.Field
              control={form.control}
              name="name"
              render={({ field }) => {
                return (
                  <Form.Item>
                    <Form.Label>{t("fields.name")}</Form.Label>
                    <Form.Control>
                      <Input size="small" {...field} />
                    </Form.Control>
                    <Form.ErrorMessage />
                  </Form.Item>
                )
              }}
            />
            <Form.Field
              control={form.control}
              name="address.address_1"
              render={({ field }) => {
                return (
                  <Form.Item>
                    <Form.Label>{t("fields.address")}</Form.Label>
                    <Form.Control>
                      <Input size="small" {...field} />
                    </Form.Control>
                    <Form.ErrorMessage />
                  </Form.Item>
                )
              }}
            />
            <Form.Field
              control={form.control}
              name="address.address_2"
              render={({ field }) => {
                return (
                  <Form.Item>
                    <Form.Label optional>{t("fields.address2")}</Form.Label>
                    <Form.Control>
                      <Input size="small" {...field} />
                    </Form.Control>
                    <Form.ErrorMessage />
                  </Form.Item>
                )
              }}
            />
            <Form.Field
              control={form.control}
              name="address.postal_code"
              render={({ field }) => {
                return (
                  <Form.Item>
                    <Form.Label optional>{t("fields.postalCode")}</Form.Label>
                    <Form.Control>
                      <Input size="small" {...field} />
                    </Form.Control>
                    <Form.ErrorMessage />
                  </Form.Item>
                )
              }}
            />
            <Form.Field
              control={form.control}
              name="address.country_code"
              render={({ field }) => {
                return (
                  <Form.Item>
                    <Form.Label>{t("fields.country")}</Form.Label>
                    <Form.Control>
                      <CountrySelect {...field} />
                    </Form.Control>
                    <Form.ErrorMessage />
                  </Form.Item>
                )
              }}
            />
            {/* Province before city, and city gated on it: a city name is not
                unique across provinces, so the pair only resolves in that
                order — the same order the store address asks for them in. */}
            <Form.Field
              control={form.control}
              name="address.province"
              render={({ field }) => {
                return (
                  <Form.Item>
                    <Form.Label optional>{t("geography.province")}</Form.Label>
                    <Form.Control>
                      <GeoProvinceSelect
                        provinces={provinces}
                        value={field.value}
                        onChange={(value) => {
                          form.setValue("address.province", value, {
                            shouldDirty: true,
                            shouldValidate: true,
                          })
                          // The old city belongs to the old province; keeping
                          // it would save a pair that resolves to nothing.
                          form.setValue("address.city", "", {
                            shouldDirty: true,
                          })
                        }}
                        data-testid="location-address-province"
                      />
                    </Form.Control>
                    <Form.ErrorMessage />
                  </Form.Item>
                )
              }}
            />
            <Form.Field
              control={form.control}
              name="address.city"
              render={({ field }) => {
                return (
                  <Form.Item>
                    <Form.Label optional>{t("geography.city")}</Form.Label>
                    <Form.Control>
                      <GeoCitySelect
                        cities={cities}
                        value={field.value}
                        disabled={!selectedProvince}
                        onChange={(value) =>
                          form.setValue("address.city", value, {
                            shouldDirty: true,
                            shouldValidate: true,
                          })
                        }
                        data-testid="location-address-city"
                      />
                    </Form.Control>
                    <Form.ErrorMessage />
                  </Form.Item>
                )
              }}
            />
            <Form.Field
              control={form.control}
              name="address.company"
              render={({ field }) => {
                return (
                  <Form.Item>
                    <Form.Label optional>{t("fields.company")}</Form.Label>
                    <Form.Control>
                      <Input size="small" {...field} />
                    </Form.Control>
                    <Form.ErrorMessage />
                  </Form.Item>
                )
              }}
            />
            <Form.Field
              control={form.control}
              name="address.phone"
              render={({ field }) => {
                return (
                  <Form.Item>
                    <Form.Label optional>{t("fields.phone")}</Form.Label>
                    <Form.Control>
                      <Input size="small" {...field} />
                    </Form.Control>
                    <Form.ErrorMessage />
                  </Form.Item>
                )
              }}
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
            <Button size="small" type="submit" isLoading={isPending}>
              {t("actions.save")}
            </Button>
          </div>
        </RouteDrawer.Footer>
      </KeyboundForm>
    </RouteDrawer.Form>
  )
}
