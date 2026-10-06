import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import {
  AttributeType,
  type ProductAttributeDTO,
  type ProductAttributeValueDTO,
  type WrappedProductAttributeDTO,
  type WrappedProductAttributeValueDTO,
} from "@mercurjs/types"

const SELECT_TYPES = new Set<AttributeType>([
  AttributeType.SINGLE_SELECT,
  AttributeType.MULTI_SELECT,
])

const byRank = (
  a: WrappedProductAttributeValueDTO,
  b: WrappedProductAttributeValueDTO,
) => (a.rank ?? 0) - (b.rank ?? 0)

const toValue = (
  v: ProductAttributeValueDTO,
): WrappedProductAttributeValueDTO => ({ id: v.id, name: v.name, rank: v.rank })

/**
 * Only a `multi_select` attribute is mirrored onto a ProductOption, so only that
 * kind can define variants. A dictionary entry such as a `unit` "capacity" may
 * carry `is_variant_axis` as a descriptive hint; reporting it as an axis made
 * the variant forms send it as an option the product does not have, and Medusa
 * refused every save.
 */
const definesVariants = (attribute?: {
  type?: AttributeType | string | null
  is_variant_axis?: boolean | null
}) =>
  !!attribute?.is_variant_axis && attribute?.type === AttributeType.MULTI_SELECT

export function wrapProductWithProductAttributes(products: any[]): void {
  if (!products?.length) return

  for (const product of products) {
    if (!product) continue

    const attrsById = new Map<string, WrappedProductAttributeDTO>()

    const scopedAttributes: ProductAttributeDTO[] =
      product.scoped_attributes ?? []

    for (const scoped of scopedAttributes) {
      attrsById.set(scoped.id, {
        id: scoped.id,
        name: scoped.name,
        handle: scoped.handle ?? null,
        type: scoped.type,
        is_variant_axis: definesVariants(scoped),
        is_required: !!scoped.is_required,
        rank: scoped.rank,
        is_scoped: true,
        all_values: (scoped.values ?? []).map(toValue),
        values: [],
      })
    }

    const linkedValues: ProductAttributeValueDTO[] =
      product.product_attribute_values ?? []

    for (const value of linkedValues) {
      const attributeId = value.attribute?.id ?? value.attribute_id
      if (!attributeId) continue

      let entry = attrsById.get(attributeId)
      if (!entry) {
        const attribute = value.attribute
        entry = {
          id: attributeId,
          name: attribute?.name,
          handle: attribute?.handle ?? null,
          type: attribute?.type,
          is_variant_axis: definesVariants(attribute),
          is_required: !!attribute?.is_required,
          rank: attribute?.rank,
          is_scoped: false,
          all_values: (attribute?.values ?? []).map(toValue),
          values: [],
        }
        attrsById.set(attributeId, entry)
      }

      entry.values.push({
        id: value.id,
        name: value.name ?? "",
        rank: value.rank,
      })
    }

    for (const entry of attrsById.values()) {
      entry.all_values.sort(byRank)
      entry.values.sort(byRank)
    }

    product.attributes = [...attrsById.values()].sort(
      (a, b) => (a.rank ?? 0) - (b.rank ?? 0),
    )
  }
}

const LINKED_ATTRIBUTE_VALUES = "product_attribute_values.attribute.values"

/**
 * Drops `product_attribute_values.attribute.values*` from a product read.
 *
 * The remote joiner fetches that cross-link 2-hop populate and then returns it
 * empty, so it cost a `product_attribute_value` scan on every product read for
 * nothing; `enrichProductAttributes` resolves those values instead.
 */
export const withoutLinkedAttributeValues = (fields: string[]): string[] =>
  fields.filter((field) => !field.includes(LINKED_ATTRIBUTE_VALUES))

/**
 * A global (non-scoped) attribute's full value set is resolved here, for every
 * product in the page at once, with one `product_attribute_value` read.
 */
export async function enrichProductAttributes(
  scope: MedusaContainer,
  products: any[],
): Promise<void> {
  wrapProductWithProductAttributes(products)
  if (!products?.length) return

  const missingIds = new Set<string>()
  for (const product of products) {
    for (const attr of (product?.attributes ??
      []) as WrappedProductAttributeDTO[]) {
      if (SELECT_TYPES.has(attr.type as AttributeType) && !attr.all_values?.length) {
        missingIds.add(attr.id)
      }
    }
  }
  if (!missingIds.size) return

  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product_attribute_value",
    fields: ["id", "name", "rank", "attribute_id"],
    filters: { attribute_id: Array.from(missingIds) },
  })

  const valuesById = new Map<string, WrappedProductAttributeValueDTO[]>()
  for (const value of (data ?? []) as ProductAttributeValueDTO[]) {
    if (!value.attribute_id) continue
    const list = valuesById.get(value.attribute_id) ?? []
    list.push(toValue(value))
    valuesById.set(value.attribute_id, list)
  }
  for (const list of valuesById.values()) {
    list.sort(byRank)
  }

  for (const product of products) {
    for (const attr of (product?.attributes ??
      []) as WrappedProductAttributeDTO[]) {
      if (!attr.all_values?.length) {
        const full = valuesById.get(attr.id)
        if (full?.length) {
          attr.all_values = full
        }
      }
    }
  }
}
