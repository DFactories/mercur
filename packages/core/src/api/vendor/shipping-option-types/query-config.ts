export const vendorShippingOptionTypeFields = [
  "id",
  "label",
  "code",
  "description",
  "created_at",
  "updated_at",
  // Admin-curated delivery info (read-only link) so the vendor option form can
  // show the promised delivery time when a type is picked.
  "delivery.estimated_delivery_days",
  "delivery.carrier",
]

export const vendorShippingOptionTypeQueryConfig = {
  list: {
    defaults: vendorShippingOptionTypeFields,
    defaultLimit: 20,
    isList: true,
  },
  retrieve: {
    defaults: vendorShippingOptionTypeFields,
    isList: false,
  },
}
