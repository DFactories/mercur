import i18n from "i18next";
import { Button, Input, toast } from "@medusajs/ui";
import { useTranslation } from "react-i18next";
import * as zod from "zod";

import { FormExtensionZone, useExtendableForm } from "@mercurjs/dashboard-shared";

import { Form } from "@components/common/form";
import { CountrySelect } from "@components/inputs/country-select";
import {
  GeoCitySelect,
  GeoProvinceSelect,
  useGeoSelection,
} from "@components/inputs/geo-select";
import { RouteDrawer, useRouteModal } from "@components/modals";
import { KeyboundForm } from "@components/utilities/keybound-form";
import { HttpTypes } from "@mercurjs/types";
import { useUpdateSellerAddress } from "@hooks/api";

type StoreAddressFormProps = {
  seller: HttpTypes.StoreSellerResponse["seller"];
};

const StoreAddressSchema = zod.object({
  name: zod
    .string()
    .min(1, { message: i18n.t("store.address.validation.nameRequired") }),
  address_1: zod.string().optional().or(zod.literal("")),
  address_2: zod.string().optional().or(zod.literal("")),
  city: zod.string().optional().or(zod.literal("")),
  province: zod.string().optional().or(zod.literal("")),
  postal_code: zod.string().optional().or(zod.literal("")),
  country_code: zod
    .string()
    .min(2, { message: i18n.t("store.address.validation.countryRequired") })
    .max(2),
});

export const StoreAddressForm = ({ seller }: StoreAddressFormProps) => {
  const { t } = useTranslation();
  const { handleSuccess } = useRouteModal();
  const address = seller.address;

  const form = useExtendableForm({
    schema: StoreAddressSchema,
    model: "seller",
    zone: "address",
    data: seller,
    defaultValues: {
      name: address?.name ?? "",
      address_1: address?.address_1 ?? "",
      address_2: address?.address_2 ?? "",
      city: address?.city ?? "",
      province: address?.province ?? "",
      postal_code: address?.postal_code ?? "",
      country_code: address?.country_code ?? "",
    },
  });

  const { provinces, selectedProvince, cities } = useGeoSelection(
    form.watch("province")
  );

  const { mutateAsync, isPending } = useUpdateSellerAddress(seller.id);

  const handleSubmit = form.handleSubmit(async (values) => {
    await mutateAsync(
      {
        name: values.name,
        address_1: values.address_1 || null,
        address_2: values.address_2 || null,
        city: values.city || null,
        province: values.province || null,
        postal_code: values.postal_code || null,
        country_code: values.country_code,
        additional_data: values.additional_data,
      },
      {
        onSuccess: () => {
          toast.success(
            t("store.address.edit.successToast"),
          );
          handleSuccess();
        },
        onError: (error: Error) => {
          toast.error(error.message);
        },
      },
    );
  });

  return (
    <RouteDrawer.Form form={form}>
      <KeyboundForm
        onSubmit={handleSubmit}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <RouteDrawer.Body className="flex flex-col gap-y-4 overflow-y-auto">
          <Form.Field
            control={form.control}
            name="name"
            render={({ field }) => (
              <Form.Item>
                <Form.Label>{t("store.address.nameLabel")}</Form.Label>
                <Form.Control>
                  <Input size="small" {...field} />
                </Form.Control>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
          <Form.Field
            control={form.control}
            name="address_1"
            render={({ field }) => (
              <Form.Item>
                <Form.Label optional>{t("fields.address")}</Form.Label>
                <Form.Control>
                  <Input size="small" {...field} />
                </Form.Control>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
          <Form.Field
            control={form.control}
            name="address_2"
            render={({ field }) => (
              <Form.Item>
                <Form.Label optional>{t("fields.address2")}</Form.Label>
                <Form.Control>
                  <Input size="small" {...field} />
                </Form.Control>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
          <Form.Field
            control={form.control}
            name="country_code"
            render={({ field }) => (
              <Form.Item>
                <Form.Label>{t("fields.country")}</Form.Label>
                <Form.Control>
                  <CountrySelect {...field} />
                </Form.Control>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
          {/* Province before city, and city gated on it: a city name is not
              unique across provinces, so the pair only resolves in that order —
              the same order the onboarding wizard asks for them in. */}
          <Form.Field
            control={form.control}
            name="province"
            render={({ field }) => (
              <Form.Item>
                <Form.Label optional>{t("geography.province")}</Form.Label>
                <Form.Control>
                  <GeoProvinceSelect
                    provinces={provinces}
                    value={field.value}
                    onChange={(value) => {
                      form.setValue("province", value, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                      // The old city belongs to the old province; keeping it
                      // would submit a pair that resolves to nothing.
                      form.setValue("city", "", { shouldDirty: true });
                    }}
                    data-testid="store-address-province"
                  />
                </Form.Control>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
          <Form.Field
            control={form.control}
            name="city"
            render={({ field }) => (
              <Form.Item>
                <Form.Label optional>{t("geography.city")}</Form.Label>
                <Form.Control>
                  <GeoCitySelect
                    cities={cities}
                    value={field.value}
                    disabled={!selectedProvince}
                    onChange={(value) =>
                      form.setValue("city", value, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                    data-testid="store-address-city"
                  />
                </Form.Control>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
          <Form.Field
            control={form.control}
            name="postal_code"
            render={({ field }) => (
              <Form.Item>
                <Form.Label optional>{t("fields.postalCode")}</Form.Label>
                <Form.Control>
                  <Input size="small" {...field} />
                </Form.Control>
                <Form.ErrorMessage />
              </Form.Item>
            )}
          />
          <FormExtensionZone
            model="seller"
            zone="address"
            control={form.control}
            data={seller}
          />
        </RouteDrawer.Body>
        <RouteDrawer.Footer>
          <div className="flex items-center justify-end gap-x-2">
            <RouteDrawer.Close asChild>
              <Button variant="secondary" size="small">
                {t("actions.cancel")}
              </Button>
            </RouteDrawer.Close>
            <Button type="submit" size="small" isLoading={isPending}>
              {t("actions.save")}
            </Button>
          </div>
        </RouteDrawer.Footer>
      </KeyboundForm>
    </RouteDrawer.Form>
  );
};
