import { describe, expect, it } from "vitest"

import { planAxisDetach, planVariantAxisReconcile } from "./variant-axes"

const option = (id: string, title: string, values: string[]) => ({
  id,
  title,
  values: values.map((value, i) => ({ id: `${id}_v${i}`, value })),
})

describe("planVariantAxisReconcile", () => {
  it("drops the placeholder and gives the variant the first value of each axis", () => {
    const plan = planVariantAxisReconcile({
      options: [
        option("opt_def", "__default__", ["__default__"]),
        option("opt_vol", "حجم", ["300 سی سی", "500 سی سی"]),
        option("opt_w", "وزن", ["4 گرم"]),
      ],
      variants: [{ id: "v1", options: { __default__: "__default__" } }],
    })

    expect(plan.changed).toBe(true)
    expect(plan.option_ids).toEqual(["opt_vol", "opt_w"])
    expect(plan.variants).toEqual([
      { id: "v1", options: { حجم: "300 سی سی", وزن: "4 گرم" } },
    ])
  })

  it("keeps a value the variant already holds", () => {
    const plan = planVariantAxisReconcile({
      options: [option("opt_vol", "حجم", ["300 سی سی", "500 سی سی"])],
      variants: [{ id: "v1", options: { حجم: "500 سی سی" } }],
    })

    expect(plan.changed).toBe(false)
  })

  it("restores the placeholder for a single variant once no axis is left", () => {
    const plan = planVariantAxisReconcile({
      options: [],
      variants: [{ id: "v1", options: {} }],
    })

    expect(plan).toEqual(
      expect.objectContaining({
        changed: true,
        create_default: true,
        variants: [{ id: "v1", options: { __default__: "__default__" } }],
      }),
    )
  })

  it("respects the product's allowed value subset", () => {
    const plan = planVariantAxisReconcile({
      options: [
        {
          ...option("opt_c", "رنگ", ["سفید", "مشکی"]),
          allowed_value_ids: ["opt_c_v1"],
        },
      ],
      variants: [{ id: "v1", options: {} }],
    })

    expect(plan.variants[0].options).toEqual({ رنگ: "مشکی" })
  })

  it("changes nothing for a product without variants", () => {
    const plan = planVariantAxisReconcile({
      options: [option("opt_def", "__default__", ["__default__"])],
      variants: [],
    })

    expect(plan.changed).toBe(false)
  })
})

describe("planAxisDetach", () => {
  it("refuses an axis the variants differ on", () => {
    const { blocking } = planAxisDetach({
      options: [option("opt_vol", "حجم", ["300", "500"])],
      variants: [
        { id: "v1", options: { حجم: "300" } },
        { id: "v2", options: { حجم: "500" } },
      ],
      detach_option_ids: ["opt_vol"],
    })

    expect(blocking.map((o) => o.id)).toEqual(["opt_vol"])
  })

  it("takes a shared value off every variant", () => {
    const { blocking, plan } = planAxisDetach({
      options: [
        option("opt_vol", "حجم", ["300"]),
        option("opt_c", "رنگ", ["سفید", "مشکی"]),
      ],
      variants: [
        { id: "v1", options: { حجم: "300", رنگ: "سفید" } },
        { id: "v2", options: { حجم: "300", رنگ: "مشکی" } },
      ],
      detach_option_ids: ["opt_vol"],
    })

    expect(blocking).toEqual([])
    expect(plan.option_ids).toEqual(["opt_c"])
    expect(plan.variants).toEqual([
      { id: "v1", options: { رنگ: "سفید" } },
      { id: "v2", options: { رنگ: "مشکی" } },
    ])
  })
})
