import { Heading } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"

import { RouteDrawer } from "@components/modals"
import { useShippingOption } from "@hooks/api/shipping-options"
import { EditShippingOptionForm } from "./_components/edit-shipping-option-form"
import { FulfillmentSetType } from "@pages/settings/locations/_common/constants"

const LocationServiceZoneShippingOptionEdit = () => {
  const { t } = useTranslation()

  const { location_id, so_id } = useParams()

  // Retrieved by id. Picking it out of the list read only the list's first
  // page (20 rows), so an option past it — easy once per-cart freight options
  // accumulate — opened as "not found". The route answers 404 itself.
  const {
    shipping_option: shippingOption,
    isError,
    error,
  } = useShippingOption(so_id!, {
    fields: "+service_zone.fulfillment_set.type",
  })

  if (isError) {
    throw error
  }

  const isPickup =
    shippingOption?.service_zone.fulfillment_set.type ===
    FulfillmentSetType.Pickup

  return (
    <RouteDrawer>
      <RouteDrawer.Header>
        <Heading>
          {t(
            `stockLocations.${isPickup ? "pickupOptions" : "shippingOptions"}.edit.header`
          )}
        </Heading>
      </RouteDrawer.Header>
      {shippingOption && (
        <EditShippingOptionForm
          shippingOption={shippingOption}
          locationId={location_id!}
          type={
            shippingOption.service_zone.fulfillment_set
              .type as FulfillmentSetType
          }
        />
      )}
    </RouteDrawer>
  )
}

export const Component = LocationServiceZoneShippingOptionEdit
