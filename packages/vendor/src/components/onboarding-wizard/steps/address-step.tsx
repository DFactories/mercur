import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Heading, Input, Select } from "@medusajs/ui";
import i18n from "i18next";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import * as z from "zod";

import { Form } from "@components/common/form";
import { CountrySelect } from "@components/inputs/country-select/country-select";
import { useGeoCities, useGeoProvinces } from "@hooks/api";

const AddressStepSchema = z.object({
  name: z.string().min(1, i18n.t("onboarding.wizard.validation.nameRequired")),
  address_1: z.string().optional(),
  address_2: z.string().optional(),
  postal_code: z.string().optional(),
  city: z.string().optional(),
  country_code: z.string().min(1, i18n.t("onboarding.wizard.validation.countryRequired")),
  province: z.string().optional(),
});

type AddressStepValues = z.infer<typeof AddressStepSchema>;

type AddressStepProps = {
  onSubmit: (data: AddressStepValues) => Promise<void>;
  onSkip: () => void;
  isPending?: boolean;
};

export const AddressStep = ({ onSubmit, onSkip, isPending }: AddressStepProps) => {
  const { t, i18n: i18next } = useTranslation();
  const isFa = i18next.language?.startsWith("fa");

  // DFACTORIES: Iran-only marketplace — the country is fixed to Iran and the
  // province/city pair comes from the admin-managed geography module.
  const { data: provincesData } = useGeoProvinces();
  const provinces = provincesData?.provinces ?? [];

  const form = useForm<AddressStepValues>({
    resolver: zodResolver(AddressStepSchema),
    defaultValues: {
      name: "",
      address_1: "",
      address_2: "",
      postal_code: "",
      city: "",
      country_code: "ir",
      province: "",
    },
  });

  const provinceName = form.watch("province");
  const selectedProvince = provinces.find((p) => p.name === provinceName);

  const { data: citiesData } = useGeoCities(selectedProvince?.id);
  const cities = [...(citiesData?.cities ?? [])].sort(
    (a, b) => Number(b.is_capital) - Number(a.is_capital),
  );

  const displayName = (item: { name: string; name_en: string | null }) =>
    isFa ? item.name : (item.name_en ?? item.name);

  const handleSubmit = form.handleSubmit(async (data) => {
    await onSubmit(data);
  });

  return (
    <div className="flex flex-col gap-y-8">
      <Heading level="h2" className="text-ui-fg-base text-lg">
        {t("onboarding.wizard.address.title")}
      </Heading>

      <Form {...form}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-y-6">
          <div className="flex flex-col gap-y-4">
            <Form.Field
              control={form.control}
              name="name"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>
                    {t("onboarding.wizard.address.name")}
                  </Form.Label>
                  <Form.Control>
                    <Input {...field} />
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
                  <Form.Label optional>{t("onboarding.wizard.address.address")}</Form.Label>
                  <Form.Control>
                    <Input autoComplete="address-line1" {...field} />
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
                  <Form.Label optional>
                    {t("onboarding.wizard.address.address2")}
                  </Form.Label>
                  <Form.Control>
                    <Input autoComplete="address-line2" {...field} />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
            <Form.Field
              control={form.control}
              name="country_code"
              render={({ field: { onChange, ref: _ref, ...field } }) => (
                <Form.Item>
                  <Form.Label>{t("onboarding.wizard.address.country")}</Form.Label>
                  <Form.Control>
                    <CountrySelect {...field} onChange={onChange} disabled />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
            <Form.Field
              control={form.control}
              name="province"
              render={({ field: { onChange: _onChange, ref: _ref, ...field } }) => (
                <Form.Item>
                  <Form.Label optional>{t("onboarding.wizard.address.state")}</Form.Label>
                  <Form.Control>
                    <Select
                      {...field}
                      value={field.value || undefined}
                      onValueChange={(value) => {
                        form.setValue("province", value, {
                          shouldValidate: true,
                        });
                        form.setValue("city", "");
                      }}
                    >
                      <Select.Trigger className="w-full">
                        <Select.Value
                          placeholder={t(
                            "onboarding.wizard.address.selectProvince",
                          )}
                        />
                      </Select.Trigger>
                      <Select.Content>
                        {provinces.map((province) => (
                          <Select.Item key={province.id} value={province.name}>
                            {displayName(province)}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select>
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
            <Form.Field
              control={form.control}
              name="city"
              render={({ field: { onChange: _onChange, ref: _ref, ...field } }) => (
                <Form.Item>
                  <Form.Label optional>{t("onboarding.wizard.address.city")}</Form.Label>
                  <Form.Control>
                    <Select
                      {...field}
                      value={field.value || undefined}
                      disabled={!selectedProvince}
                      onValueChange={(value) =>
                        form.setValue("city", value, { shouldValidate: true })
                      }
                    >
                      <Select.Trigger className="w-full">
                        <Select.Value
                          placeholder={t("onboarding.wizard.address.selectCity")}
                        />
                      </Select.Trigger>
                      <Select.Content>
                        {cities.map((city) => (
                          <Select.Item key={city.id} value={city.name}>
                            {displayName(city)}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select>
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
                  <Form.Label optional>{t("onboarding.wizard.address.postalCode")}</Form.Label>
                  <Form.Control>
                    <Input autoComplete="postal-code" {...field} />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )}
            />
          </div>
          <div className="flex flex-col gap-y-2">
            <Button type="submit" className="w-full" isLoading={isPending}>
              {t("actions.continue")}
            </Button>
            <Button
              type="button"
              variant="transparent"
              className="w-full"
              onClick={onSkip}
            >
              {t("onboarding.wizard.skip")}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
};
