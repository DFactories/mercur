import { Heading, Hint, Input, RadioGroup, Text } from "@medusajs/ui"
import { UseFormReturn, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"

import { VendorExtendedAdminServiceZone } from "@custom-types/stock-location"

import { Form } from "@components/common/form"
import { Combobox } from "@components/inputs/combobox"
import { useShippingOptionType } from "@hooks/api/shipping-option-types"
import { useComboboxData } from "@hooks/use-combobox-data"
import { fetchQuery } from "@lib/client"
import {
  FREIGHT_COLLECT_TYPE_CODE,
  isSelectableShippingType,
  isUnpricedShippingType,
} from "@lib/shipping-options"
import { ShippingProfileGoodsHint } from "@pages/settings/locations/_common/components"
import { useShippingProfileCombobox } from "@pages/settings/locations/_common/hooks/use-shipping-profile-combobox"
import {
  FulfillmentSetType,
  ShippingOptionPriceType,
  providerSupportsCalculatedPricing,
} from "@pages/settings/locations/_common/constants"
import { CreateShippingOptionSchema } from "./schema"

type CreateShippingOptionDetailsFormProps = {
  form: UseFormReturn<CreateShippingOptionSchema>
  isReturn?: boolean
  zone: VendorExtendedAdminServiceZone
  type: FulfillmentSetType
}

export const CreateShippingOptionDetailsForm = ({
  form,
  isReturn = false,
  zone,
  type
}: CreateShippingOptionDetailsFormProps) => {
  const { t } = useTranslation()

  const isPickup = type === FulfillmentSetType.Pickup

  // Calculated pricing is only offered when the provider can actually price the
  // option; otherwise the create call fails server-side (see the constant).
  const supportsCalculated = providerSupportsCalculatedPricing(
    form.watch("provider_id")
  )

  const shippingProfiles = useShippingProfileCombobox()

  // Admin-curated shipping method types. Each option shows the promised delivery
  // time (from the type's delivery link); the backend stamps that onto the
  // option so the vendor never sets it directly. The page params are forwarded
  // so the list pages and searches on the server instead of repeating its
  // first page.
  const shippingOptionTypes = useComboboxData({
    queryFn: (params: {
      q?: string
      limit?: number
      offset?: number
    }) =>
      fetchQuery(`/vendor/shipping-option-types`, {
        method: "GET",
        query: params as Record<string, string | number>,
      }),
    queryKey: ["vendor_shipping_option_types_combobox"],
    getOptions: (data) =>
      (data.shipping_option_types || [])
        // The type the backend mints for one cart's agreed carriage is not a
        // store's own choice.
        .filter((optionType: any) => isSelectableShippingType(optionType.code))
        .map((optionType: any) => {
          const days = optionType.delivery?.estimated_delivery_days
          return {
            label:
              days === null || days === undefined
                ? optionType.label
                : `${optionType.label} (${days}d)`,
            value: optionType.id,
          }
        }),
  })

  const selectedTypeId = useWatch({
    control: form.control,
    name: "shipping_option_type_id",
  })

  const { shipping_option_type: selectedType } = useShippingOptionType(
    selectedTypeId,
    undefined,
    { enabled: !!selectedTypeId }
  )

  const unpricedTypeCode =
    selectedTypeId && isUnpricedShippingType(selectedType?.code)
      ? selectedType?.code
      : undefined

  // const fulfillmentProviders = useComboboxData({
  //   queryFn: (params) =>
  //     sdk.admin.fulfillmentProvider.list({
  //       ...params,
  //       stock_location_id: locationId,
  //     }),
  //   queryKey: ['fulfillment_providers'],
  //   getOptions: (data) =>
  //     data.fulfillment_providers.map((provider) => ({
  //       label: formatProvider(provider.id),
  //       value: provider.id,
  //     })),
  // });

  return (
    <div className="flex flex-1 flex-col items-center overflow-y-auto">
      <div className="flex w-full max-w-[720px] flex-col gap-y-8 px-6 py-16">
        <div>
          <Heading>
            {t(
              `stockLocations.shippingOptions.create.${
                isPickup ? "pickup" : isReturn ? "returns" : "shipping"
              }.header`,
              {
                zone: zone.name,
              }
            )}
          </Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t(
              `stockLocations.shippingOptions.create.${
                isReturn ? "returns" : isPickup ? "pickup" : "shipping"
              }.hint`
            )}
          </Text>
        </div>

        {!isPickup && (
          <Form.Field
            control={form.control}
            name="price_type"
            render={({ field }) => {
              return (
                <Form.Item>
                  <Form.Label>
                    {t("stockLocations.shippingOptions.fields.priceType.label")}
                  </Form.Label>
                  <Form.Control>
                    <RadioGroup
                      className="grid grid-cols-1 gap-4 md:grid-cols-2"
                      {...field}
                      onValueChange={field.onChange}
                    >
                      <RadioGroup.ChoiceBox
                        className="flex-1"
                        value={ShippingOptionPriceType.FlatRate}
                        label={t(
                          "stockLocations.shippingOptions.fields.priceType.options.fixed.label"
                        )}
                        description={t(
                          "stockLocations.shippingOptions.fields.priceType.options.fixed.hint"
                        )}
                      />
                      {supportsCalculated && (
                        <RadioGroup.ChoiceBox
                          className="flex-1"
                          value={ShippingOptionPriceType.Calculated}
                          label={t(
                            "stockLocations.shippingOptions.fields.priceType.options.calculated.label"
                          )}
                          description={t(
                            "stockLocations.shippingOptions.fields.priceType.options.calculated.hint"
                          )}
                        />
                      )}
                    </RadioGroup>
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )
            }}
          />
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Field
            control={form.control}
            name="name"
            render={({ field }) => {
              return (
                <Form.Item>
                  <Form.Label>{t("fields.name")}</Form.Label>
                  <Form.Control>
                    <Input {...field} />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              )
            }}
          />
          <Form.Field
            control={form.control}
            name="shipping_profile_id"
            render={({ field }) => {
              return (
                <Form.Item>
                  <Form.Label>
                    {t("stockLocations.shippingOptions.fields.profile")}
                  </Form.Label>
                  <Form.Control>
                    <Combobox
                      {...field}
                      options={shippingProfiles.options}
                      searchValue={shippingProfiles.searchValue}
                      onSearchValueChange={shippingProfiles.onSearchValueChange}
                      disabled={shippingProfiles.disabled}
                    />
                  </Form.Control>
                  <Form.ErrorMessage />
                  <ShippingProfileGoodsHint shippingProfileId={field.value} />
                </Form.Item>
              )
            }}
          />
          <Form.Field
            control={form.control}
            name="shipping_option_type_id"
            render={({ field }) => {
              return (
                <Form.Item>
                  <Form.Label
                    tooltip={t(
                      "stockLocations.shippingOptions.fields.typeHint",
                      "The standard shipping method. Its delivery time (shown in parentheses) is set by the marketplace and starts the order return window."
                    )}
                  >
                    {t("stockLocations.shippingOptions.fields.type")}
                  </Form.Label>
                  <Form.Control>
                    <Combobox
                      {...field}
                      options={shippingOptionTypes.options}
                      searchValue={shippingOptionTypes.searchValue}
                      onSearchValueChange={
                        shippingOptionTypes.onSearchValueChange
                      }
                      disabled={shippingOptionTypes.disabled}
                    />
                  </Form.Control>
                  <Form.ErrorMessage />
                  {unpricedTypeCode && (
                    <Hint data-testid="shipping-option-type-no-price-hint">
                      {t(
                        unpricedTypeCode === FREIGHT_COLLECT_TYPE_CODE
                          ? "stockLocations.shippingOptions.fields.noPrice.freightCollect"
                          : "stockLocations.shippingOptions.fields.noPrice.freightQuote"
                      )}
                    </Hint>
                  )}
                </Form.Item>
              )
            }}
          />
        </div>

        {/* <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
          <Form.Field
            control={form.control}
            name='provider_id'
            render={({ field }) => {
              return (
                <Form.Item>
                  <Form.Label
                    tooltip={t(
                      'stockLocations.fulfillmentProviders.shippingOptionsTooltip'
                    )}
                  >
                    {t(
                      'stockLocations.shippingOptions.fields.provider'
                    )}
                  </Form.Label>
                  <Form.Control>
                    <Combobox
                      {...field}
                      onChange={(e) => {
                        field.onChange(e);
                        form.setValue(
                          'fulfillment_option_id',
                          ''
                        );
                      }}
                      options={fulfillmentProviders.options}
                      searchValue={
                        fulfillmentProviders.searchValue
                      }
                      onSearchValueChange={
                        fulfillmentProviders.onSearchValueChange
                      }
                      disabled={
                        fulfillmentProviders.disabled
                      }
                    />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              );
            }}
          />

          <Form.Field
            control={form.control}
            name='fulfillment_option_id'
            render={({ field }) => {
              return (
                <Form.Item>
                  <Form.Label>
                    {t(
                      'stockLocations.shippingOptions.fields.fulfillmentOption'
                    )}
                  </Form.Label>
                  <Form.Control>
                    <Select
                      {...field}
                      onValueChange={field.onChange}
                      disabled={!selectedProviderId}
                      key={selectedProviderId}
                    >
                      <Select.Trigger ref={field.ref}>
                        <Select.Value />
                      </Select.Trigger>

                      <Select.Content>
                        {fulfillmentProviderOptions
                          ?.filter(
                            (fo) =>
                              !!fo.is_return === isReturn
                          )
                          .map((option) => (
                            <Select.Item
                              value={option.id}
                              key={option.id}
                            >
                              {option.name || option.id}
                            </Select.Item>
                          ))}
                      </Select.Content>
                    </Select>
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              );
            }}
          />
        </div> */}

        {/* <Divider />
        <SwitchBox
          control={form.control}
          name="enabled_in_store"
          label={t("stockLocations.shippingOptions.fields.enableInStore.label")}
          description={t(
            "stockLocations.shippingOptions.fields.enableInStore.hint"
          )}
        /> */}
      </div>
    </div>
  )
}
