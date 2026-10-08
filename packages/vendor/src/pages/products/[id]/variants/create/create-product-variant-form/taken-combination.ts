type VariantWithOptions = {
  id: string
  title?: string | null
  options?: Array<{
    value?: string | null
    option?: { title?: string | null } | null
  }> | null
}

type AxisAttribute = {
  name?: string | null
  values?: Array<{ name?: string | null }> | null
}

const optionMap = (variant: VariantWithOptions) =>
  new Map(
    (variant.options ?? [])
      .filter((o) => o.option?.title)
      .map((o) => [o.option!.title!, (o.value ?? "").trim()] as const),
  )

/** The variant that already has exactly these axis values, if one does. */
export const findVariantWithOptions = <T extends VariantWithOptions>(
  variants: T[],
  chosen: Record<string, string>,
): T | undefined => {
  const entries = Object.entries(chosen)
  if (!entries.length) {
    return undefined
  }
  return variants.find((variant) => {
    const own = optionMap(variant)
    return entries.every(([title, value]) => own.get(title) === value.trim())
  })
}

/**
 * Every combination of the axes' values is already a variant, so the form
 * cannot offer a new one until a value is added to an axis (production,
 * 2026-10-08: eleven attempts at a second variant of a one-value axis).
 */
export const allCombinationsTaken = (
  attributes: AxisAttribute[],
  variants: VariantWithOptions[],
): boolean => {
  if (!attributes.length) {
    return false
  }
  const axes = attributes.map((a) => ({
    title: a.name ?? "",
    values: (a.values ?? []).map((v) => (v.name ?? "").trim()).filter(Boolean),
  }))
  if (axes.some((axis) => !axis.values.length)) {
    return false
  }
  let combinations: Record<string, string>[] = [{}]
  for (const axis of axes) {
    combinations = combinations.flatMap((combo) =>
      axis.values.map((value) => ({ ...combo, [axis.title]: value })),
    )
  }
  return combinations.every(
    (combo) => !!findVariantWithOptions(variants, combo),
  )
}
