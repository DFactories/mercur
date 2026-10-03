export const OFFER_DRAFT_FIELDS = [
  "id",
  "seller_id",
  "product_id",
  "variant_id",
  "external_id",
  "status",
  "completed_offer_id",
  "completed_at",
  "created_by",
  "metadata",
  "created_at",
  "updated_at",
  "seller.id",
  "seller.name",
  "seller.handle",
  "product.id",
  "product.title",
  "product.handle",
  "product.thumbnail",
  "product.status",
  "product_variant.id",
  "product_variant.title",
  "product_variant.sku",
]

type Row = Record<string, unknown> & {
  seller?: Record<string, unknown> | null
  product?: Record<string, unknown> | null
  product_variant?: Record<string, unknown> | null
}

const pick = <T extends string>(
  row: Record<string, unknown> | null | undefined,
  keys: T[]
): Record<T, unknown> | null =>
  row
    ? (Object.fromEntries(keys.map((k) => [k, row[k] ?? null])) as Record<
        T,
        unknown
      >)
    : null

export const toOfferDraftResponse = (row: Row) => ({
  id: row.id,
  seller_id: row.seller_id,
  product_id: row.product_id,
  variant_id: row.variant_id ?? null,
  external_id: row.external_id ?? null,
  status: row.status,
  completed_offer_id: row.completed_offer_id ?? null,
  completed_at: row.completed_at ?? null,
  created_by: row.created_by ?? null,
  metadata: row.metadata ?? null,
  created_at: row.created_at,
  updated_at: row.updated_at,
  seller: pick(row.seller, ["id", "name", "handle"]),
  product: pick(row.product, ["id", "title", "handle", "thumbnail", "status"]),
  variant: pick(row.product_variant, ["id", "title", "sku"]),
})
