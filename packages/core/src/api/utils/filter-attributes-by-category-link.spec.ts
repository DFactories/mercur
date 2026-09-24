import { describe, expect, it, vi } from "vitest"

import {
  categoryIdsWithAncestors,
  filterAttributesByCategoryLinkOrGlobal,
} from "./filter-attributes-by-category-link"

/**
 * A category-scoped attribute applies to the whole subtree under it.
 *
 * The attribute dictionary scopes `polymer`, `capacity_ml`, `lid_type`,
 * `temperature_use` and `shape` to TOP-LEVEL categories («ظروف غذا»,
 * «لیوان و ظروف نوشیدنی», …) and writes the link on exactly those nodes. The
 * product form asks with the product's own category, which is almost always a
 * leaf («جعبه غذا», «لیوان»), and the filter matched links exactly — so a seller
 * filing a meal box was never offered «نوع پلیمر», and the facets the
 * dictionary exists for stayed empty on nearly every product.
 */

const FOOD_CONTAINERS = "pcat_food_containers"
const MEAL_BOXES = "pcat_meal_boxes"
const LABELS = "pcat_labels"

const categories = [
  { id: FOOD_CONTAINERS, mpath: FOOD_CONTAINERS },
  { id: MEAL_BOXES, mpath: `${FOOD_CONTAINERS}.${MEAL_BOXES}` },
  { id: LABELS, mpath: LABELS },
]

const attributes = [
  // Scoped to the parent only, exactly as the seeder writes it.
  { id: "attr_polymer", categories: [{ id: FOOD_CONTAINERS }] },
  // The remote joiner returns a lone link as an object, not an array.
  { id: "attr_meal_box_only", categories: { id: MEAL_BOXES } },
  { id: "attr_label_only", categories: [{ id: LABELS }] },
  { id: "attr_material", categories: [] },
]

const run = async (productCategoryId: string | string[]) => {
  const graph = vi.fn(async ({ entity, filters }: any) => {
    if (entity === "product_category") {
      return {
        data: categories.filter((c) => filters.id.includes(c.id)),
      }
    }
    return { data: attributes }
  })

  const req: any = {
    filterableFields: { product_category_id: productCategoryId },
    scope: { resolve: () => ({ graph }) },
  }
  const next = vi.fn()

  await filterAttributesByCategoryLinkOrGlobal(req, {} as any, next)

  expect(next).toHaveBeenCalledOnce()
  const [linked, global] = req.filterableFields.$or
  return {
    linked: linked.id as string[],
    excludedUnlessLinked: global.id.$nin as string[],
    filterableFields: req.filterableFields,
  }
}

describe("categoryIdsWithAncestors", () => {
  it("adds every ancestor on the path of a leaf", () => {
    expect(
      categoryIdsWithAncestors(
        [MEAL_BOXES],
        [{ mpath: `${FOOD_CONTAINERS}.${MEAL_BOXES}` }],
      ),
    ).toEqual(new Set([MEAL_BOXES, FOOD_CONTAINERS]))
  })

  it("keeps a requested id that has no row", () => {
    expect(categoryIdsWithAncestors(["pcat_gone"], [])).toEqual(
      new Set(["pcat_gone"]),
    )
  })

  it("tolerates a missing or empty mpath", () => {
    expect(
      categoryIdsWithAncestors([LABELS], [{ mpath: null }, { mpath: "" }]),
    ).toEqual(new Set([LABELS]))
  })
})

describe("filterAttributesByCategoryLinkOrGlobal", () => {
  it("gives a leaf category the attributes scoped to its parent", async () => {
    const { linked } = await run(MEAL_BOXES)

    expect(linked).toContain("attr_polymer")
    expect(linked).toContain("attr_meal_box_only")
  })

  it("does not hand a parent the attributes scoped to one of its children", async () => {
    const { linked } = await run(FOOD_CONTAINERS)

    expect(linked).toEqual(["attr_polymer"])
  })

  it("still excludes an attribute scoped to an unrelated branch", async () => {
    const { linked, excludedUnlessLinked } = await run(MEAL_BOXES)

    expect(linked).not.toContain("attr_label_only")
    expect(excludedUnlessLinked).toContain("attr_label_only")
    // Global attributes are never excluded.
    expect(excludedUnlessLinked).not.toContain("attr_material")
  })

  it("replaces the category filter with the id clause", async () => {
    const { filterableFields } = await run([MEAL_BOXES])

    expect(filterableFields).not.toHaveProperty("product_category_id")
  })
})
