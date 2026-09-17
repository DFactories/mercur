export const vendorStoreFields = [
  "id",
  "name",
  "*supported_currencies",
  "*supported_currencies.currency",
  "default_sales_channel_id",
  "default_region_id",
  "default_location_id",
  "metadata",
  "created_at",
  "updated_at",
]

// `allowed` only strips select fields when the `rbac_filter_fields` feature flag
// is on (Medusa 2.18); `disallowed` is stripped unconditionally.
// AllowedFieldFilter compares de-starred relation paths, so `*relation`
// entries in `allowed` never match and the relation is dropped.
export const vendorStoreAllowedFields = vendorStoreFields.map((field) =>
  field.startsWith("*") ? field.slice(1) : field
)

export const vendorStoreDisallowedFields = ["members"]

export const vendorStoreQueryConfig = {
  list: {
    defaults: vendorStoreFields,
    allowed: vendorStoreAllowedFields,
    disallowed: vendorStoreDisallowedFields,
    isList: true,
  },
  retrieve: {
    defaults: vendorStoreFields,
    allowed: vendorStoreAllowedFields,
    disallowed: vendorStoreDisallowedFields,
    isList: false,
  },
}
