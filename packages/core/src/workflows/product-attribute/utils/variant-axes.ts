/**
 * The placeholder option every product is born with (`createProductsWorkflow`).
 * It must disappear once a real variant axis exists and come back when the last
 * one is removed, because Medusa requires every variant to carry exactly one
 * value per product option.
 */
export const DEFAULT_OPTION_TITLE = "__default__"
export const DEFAULT_OPTION_VALUE = "__default__"

export const AXIS_IN_USE_MESSAGE = "apiErrors.product.axisInUse"

export type AxisOption = {
  id: string
  title: string
  is_exclusive?: boolean | null
  values: { id: string; value: string }[]
  /** Values this product may use; all of the option's values when absent. */
  allowed_value_ids?: string[] | null
}

export type AxisVariant = {
  id: string
  /** option title → value */
  options: Record<string, string>
}

export type VariantAxisPlan = {
  changed: boolean
  option_ids: string[]
  variants: AxisVariant[]
  /** A `__default__` option has to be created and attached. */
  create_default: boolean
}

const allowedValues = (option: AxisOption) =>
  option.allowed_value_ids?.length
    ? option.values.filter((v) => option.allowed_value_ids!.includes(v.id))
    : option.values

const sameOptions = (a: Record<string, string>, b: Record<string, string>) => {
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k])
  )
}

/**
 * What a product's options and variant values must become so that every
 * variant carries exactly one allowed value for every attached option.
 */
export const planVariantAxisReconcile = ({
  options,
  variants,
}: {
  options: AxisOption[]
  variants: AxisVariant[]
}): VariantAxisPlan => {
  const unchanged: VariantAxisPlan = {
    changed: false,
    option_ids: options.map((o) => o.id),
    variants,
    create_default: false,
  }

  if (!variants.length) {
    return unchanged
  }

  const real = options.filter((o) => o.title !== DEFAULT_OPTION_TITLE)
  const placeholder = options.find((o) => o.title === DEFAULT_OPTION_TITLE)

  if (!real.length) {
    if (!placeholder && variants.length > 1) {
      return unchanged
    }

    const next = variants.map((variant) => ({
      id: variant.id,
      options: { [DEFAULT_OPTION_TITLE]: DEFAULT_OPTION_VALUE },
    }))

    return {
      changed:
        !placeholder ||
        variants.some((v, i) => !sameOptions(v.options, next[i].options)),
      option_ids: placeholder ? [placeholder.id] : [],
      variants: next,
      create_default: !placeholder,
    }
  }

  const next = variants.map((variant) => {
    const values: Record<string, string> = {}
    for (const option of real) {
      const allowed = allowedValues(option)
      const current = variant.options[option.title]
      values[option.title] =
        current && allowed.some((v) => v.value === current)
          ? current
          : (allowed[0]?.value ?? current)
    }
    return { id: variant.id, options: values }
  })

  return {
    changed:
      !!placeholder ||
      variants.some((v, i) => !sameOptions(v.options, next[i].options)),
    option_ids: real.map((o) => o.id),
    variants: next,
    create_default: false,
  }
}

/**
 * Removing an axis from a product: refused when the variants still differ on
 * it (dropping it would leave two identical variants), otherwise the value is
 * taken off every variant and the option detached.
 */
export const planAxisDetach = ({
  options,
  variants,
  detach_option_ids,
}: {
  options: AxisOption[]
  variants: AxisVariant[]
  detach_option_ids: string[]
}): { blocking: AxisOption[]; plan: VariantAxisPlan } => {
  const detaching = options.filter((o) => detach_option_ids.includes(o.id))

  const blocking = detaching.filter(
    (option) =>
      new Set(
        variants
          .map((v) => v.options[option.title])
          .filter((value) => value !== undefined),
      ).size > 1,
  )

  const remaining = options.filter((o) => !detach_option_ids.includes(o.id))
  const detachedTitles = new Set(detaching.map((o) => o.title))
  const stripped = variants.map((variant) => ({
    id: variant.id,
    options: Object.fromEntries(
      Object.entries(variant.options).filter(([t]) => !detachedTitles.has(t)),
    ),
  }))

  const plan = planVariantAxisReconcile({
    options: remaining,
    variants: stripped,
  })

  return {
    blocking,
    plan: {
      ...plan,
      changed: plan.changed || detaching.length > 0,
      option_ids: plan.option_ids,
    },
  }
}
