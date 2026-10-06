import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import { loadProductAxisState } from "../../product-attribute/utils/load-product-axis-state"
import {
  type AxisOption,
  DEFAULT_OPTION_TITLE,
  DEFAULT_OPTION_VALUE,
} from "../../product-attribute/utils/variant-axes"

export const VARIANT_OPTIONS_MISMATCH_MESSAGE =
  "apiErrors.product.variantOptionsMismatch"
export const OPTION_VALUE_MISSING_MESSAGE =
  "apiErrors.product.optionValueMissing"

type VariantOperation =
  | { type: "add"; variant: Record<string, unknown> }
  | { type: "update"; variant_id: string; fields: Record<string, unknown> }
  | { type: "remove"; variant_id: string }

const asOptionMap = (value: unknown): Record<string, string> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [
          k,
          String(v ?? ""),
        ]),
      )
    : undefined

/**
 * Checks the options a variant is saved with against the product's own axes
 * before the edit is recorded, so a store reads why it was refused instead of
 * Medusa's "Product has 5 option values but there were 4 provided" — and adds
 * the `__default__` placeholder the forms never show.
 */
export const normalizeVariantOptions = (
  options: AxisOption[],
  given: Record<string, string>,
): Record<string, string> => {
  const normalized = { ...given }
  if (
    options.some((o) => o.title === DEFAULT_OPTION_TITLE) &&
    normalized[DEFAULT_OPTION_TITLE] === undefined
  ) {
    normalized[DEFAULT_OPTION_TITLE] = DEFAULT_OPTION_VALUE
  }

  const titles = new Set(options.map((o) => o.title))
  const missing = options.filter((o) => normalized[o.title] === undefined)
  const unknown = Object.keys(normalized).filter((t) => !titles.has(t))

  if (missing.length || unknown.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      VARIANT_OPTIONS_MISMATCH_MESSAGE,
    )
  }

  for (const option of options) {
    const allowed = option.allowed_value_ids?.length
      ? option.values.filter((v) => option.allowed_value_ids!.includes(v.id))
      : option.values
    if (!allowed.some((v) => v.value === normalized[option.title])) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        OPTION_VALUE_MISSING_MESSAGE,
      )
    }
  }

  return normalized
}

export const normalizeVariantOptionsStepId = "pc-normalize-variant-options"

export const normalizeVariantOptionsStep = createStep(
  normalizeVariantOptionsStepId,
  async (
    input: { product_id: string; operations: VariantOperation[] },
    { container },
  ) => {
    const touchesOptions = input.operations.some(
      (op) =>
        (op.type === "add" && asOptionMap(op.variant.options)) ||
        (op.type === "update" && asOptionMap(op.fields.options)),
    )

    if (!touchesOptions) {
      return new StepResponse(input.operations)
    }

    const { options } = await loadProductAxisState(container, input.product_id)

    const operations = input.operations.map((op) => {
      if (op.type === "add") {
        const given = asOptionMap(op.variant.options)
        return given
          ? {
              ...op,
              variant: {
                ...op.variant,
                options: normalizeVariantOptions(options, given),
              },
            }
          : op
      }
      if (op.type === "update") {
        const given = asOptionMap(op.fields.options)
        return given
          ? {
              ...op,
              fields: {
                ...op.fields,
                options: normalizeVariantOptions(options, given),
              },
            }
          : op
      }
      return op
    })

    return new StepResponse(operations)
  },
)
