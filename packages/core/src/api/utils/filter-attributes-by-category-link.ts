import {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

type CategoryRef = { id?: string | null }
type AttributeWithCategories = {
  id: string
  // The remote joiner may return a single object instead of an array when an
  // attribute has exactly one category link, so accept both shapes.
  categories?: CategoryRef | CategoryRef[] | null
}

/**
 * The requested categories plus every ancestor of each.
 *
 * An attribute scoped to a category applies to everything filed beneath it:
 * the dictionary links `polymer` to «ظروف غذا» once, and a product filed under
 * its child «جعبه غذا» must still be offered it. Matching the link only against
 * the exact category a product sits on — almost always a leaf — left every
 * parent-scoped facet empty on every product.
 *
 * Ancestry is read from `mpath` (`<root id>.<…>.<own id>`), which the product
 * module keeps current on create and on re-parenting and itself relies on to
 * build the tree. The requested ids are kept even when no row comes back for
 * them, so an unknown id still narrows to exact links plus globals.
 */
export const categoryIdsWithAncestors = (
  requestedIds: string[],
  categories: { mpath?: string | null }[]
): Set<string> => {
  const ids = new Set(requestedIds)
  for (const category of categories) {
    for (const id of (category.mpath ?? "").split(".")) {
      if (id) {
        ids.add(id)
      }
    }
  }
  return ids
}

export const filterAttributesByCategoryLinkOrGlobal = async (
  req: MedusaRequest,
  _: MedusaResponse,
  next: MedusaNextFunction
) => {
  const filterableFields = req.filterableFields ?? {}
  const categoryFilter = filterableFields.product_category_id

  if (!categoryFilter) {
    return next()
  }

  delete filterableFields.product_category_id

  const categoryIds = Array.isArray(categoryFilter)
    ? categoryFilter
    : [categoryFilter]

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const [{ data: categories }, { data: attributes }] = await Promise.all([
    query.graph({
      entity: "product_category",
      fields: ["id", "mpath"],
      filters: { id: categoryIds },
    }),
    query.graph({
      entity: "product_attribute",
      fields: ["id", "categories.id"],
    }),
  ])

  const categoryIdSet = categoryIdsWithAncestors(categoryIds, categories)
  const linkedToCategoryIds: string[] = []
  const anyLinkedIds: string[] = []

  for (const attribute of attributes as AttributeWithCategories[]) {
    const raw = attribute.categories
    const categoryLinks: CategoryRef[] = Array.isArray(raw)
      ? raw
      : raw
        ? [raw]
        : []
    if (categoryLinks.length === 0) {
      continue
    }
    anyLinkedIds.push(attribute.id)
    if (
      categoryLinks.some((c) => c?.id != null && categoryIdSet.has(c.id))
    ) {
      linkedToCategoryIds.push(attribute.id)
    }
  }

  const orClause = [
    { id: linkedToCategoryIds },
    { id: { $nin: anyLinkedIds } },
  ]

  const existingId = filterableFields.id
  if (existingId !== undefined) {
    filterableFields.$and = [{ id: existingId }, { $or: orClause }]
    delete filterableFields.id
  } else {
    filterableFields.$or = orClause
  }

  req.filterableFields = filterableFields

  return next()
}
