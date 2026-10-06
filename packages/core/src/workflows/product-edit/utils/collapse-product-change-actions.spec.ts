import { ProductChangeActionType } from "@mercurjs/types"
import { describe, expect, it } from "vitest"

import { collapseProductChangeActions } from "./collapse-product-change-actions"

let ordering = 0
const action = (
  type: ProductChangeActionType,
  details: Record<string, unknown>,
  batch: string,
) => ({
  id: `act_${++ordering}`,
  product_id: "prod_1",
  action: type,
  details,
  ordering,
  created_at: batch,
})

describe("collapseProductChangeActions", () => {
  it("keeps the latest value of a field and the first previous value", () => {
    const collapsed = collapseProductChangeActions([
      action(
        ProductChangeActionType.UPDATE,
        { field: "title", value: "B", previous_value: "A" },
        "t1",
      ),
      action(
        ProductChangeActionType.UPDATE,
        { field: "title", value: "C", previous_value: "A" },
        "t2",
      ),
    ])

    expect(collapsed).toHaveLength(1)
    expect(collapsed[0].details).toEqual({
      field: "title",
      value: "C",
      previous_value: "A",
    })
  })

  it("merges updates of one variant and nets image changes", () => {
    const collapsed = collapseProductChangeActions([
      action(
        ProductChangeActionType.VARIANT_UPDATE,
        {
          variant_id: "v1",
          fields: { title: "X", images: { add: ["img1"] } },
          previous_fields: { title: "Old" },
        },
        "t1",
      ),
      action(
        ProductChangeActionType.VARIANT_UPDATE,
        {
          variant_id: "v1",
          fields: { sku: "S", images: { remove: ["img1", "img2"] } },
          previous_fields: { sku: null },
        },
        "t2",
      ),
    ])

    expect(collapsed).toHaveLength(1)
    expect(collapsed[0].details).toEqual(
      expect.objectContaining({
        variant_id: "v1",
        fields: { title: "X", sku: "S", images: { add: [], remove: ["img2"] } },
        previous_fields: { title: "Old", sku: null },
      }),
    )
  })

  it("lets a later removal of a variant drop its earlier updates", () => {
    const collapsed = collapseProductChangeActions([
      action(
        ProductChangeActionType.VARIANT_UPDATE,
        { variant_id: "v1", fields: { title: "X" } },
        "t1",
      ),
      action(ProductChangeActionType.VARIANT_REMOVE, { variant_id: "v1" }, "t2"),
    ])

    expect(collapsed.map((a) => a.action)).toEqual([
      ProductChangeActionType.VARIANT_REMOVE,
    ])
  })

  it("treats a remove and an add of one attribute in the same save as a re-attach", () => {
    const collapsed = collapseProductChangeActions([
      action(
        ProductChangeActionType.ATTRIBUTE_ADD,
        { attribute: { id: "attr_1", value_ids: ["a"] } },
        "t1",
      ),
      action(
        ProductChangeActionType.ATTRIBUTE_REMOVE,
        { attribute_id: "attr_1" },
        "t1",
      ),
    ])

    expect(collapsed.map((a) => a.action).sort()).toEqual([
      ProductChangeActionType.ATTRIBUTE_ADD,
      ProductChangeActionType.ATTRIBUTE_REMOVE,
    ])
  })

  it("lets a later save that removes an attribute win over an earlier attach", () => {
    const collapsed = collapseProductChangeActions([
      action(
        ProductChangeActionType.ATTRIBUTE_ADD,
        { attribute: { id: "attr_1", value_ids: ["a"] } },
        "t1",
      ),
      action(
        ProductChangeActionType.ATTRIBUTE_REMOVE,
        { attribute_id: "attr_1" },
        "t1",
      ),
      action(
        ProductChangeActionType.ATTRIBUTE_REMOVE,
        { attribute_id: "attr_1" },
        "t2",
      ),
    ])

    expect(collapsed.map((a) => a.action)).toEqual([
      ProductChangeActionType.ATTRIBUTE_REMOVE,
    ])
  })

  it("merges value edits of one attribute across saves", () => {
    const collapsed = collapseProductChangeActions([
      action(
        ProductChangeActionType.ATTRIBUTE_UPDATE,
        { update: { id: "attr_1", add: [{ value: "L" }] } },
        "t1",
      ),
      action(
        ProductChangeActionType.ATTRIBUTE_UPDATE,
        { update: { id: "attr_1", add: [{ value: "XL" }], title: "Size" } },
        "t2",
      ),
      action(
        ProductChangeActionType.ATTRIBUTE_UPDATE,
        { update: { id: "attr_2", value: "Matte" } },
        "t2",
      ),
    ])

    const updates = collapsed.map(
      (a) => (a.details as { update: Record<string, unknown> }).update,
    )
    expect(updates).toEqual([
      { id: "attr_1", title: "Size", add: [{ value: "L" }, { value: "XL" }] },
      { id: "attr_2", value: "Matte" },
    ])
  })

  it("keeps added variants and deletions as they are", () => {
    const collapsed = collapseProductChangeActions([
      action(ProductChangeActionType.VARIANT_ADD, { variant: { title: "A" } }, "t1"),
      action(ProductChangeActionType.VARIANT_ADD, { variant: { title: "B" } }, "t2"),
      action(ProductChangeActionType.PRODUCT_DELETE, {}, "t3"),
    ])

    expect(collapsed).toHaveLength(3)
  })
})
