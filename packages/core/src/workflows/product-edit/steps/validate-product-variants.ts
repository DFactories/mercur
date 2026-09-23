import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

export const validateProductVariantsStepId = "pc-validate-product-variants"

type ValidateProductVariantsStepInput = {
  /** Variant ids the edit names. */
  variant_ids: string[]
  /** What was found for those ids WITHIN the edited product. */
  variants: Array<{ id: string } | null | undefined>
}

/**
 * Every variant an edit updates or removes must belong to the product in the
 * URL. The route only proves the seller manages THAT product, and the change
 * actions carry the variant id on its own — so without this a seller could
 * name another store's variant under their own product and have it rewritten
 * the moment the change is confirmed.
 */
export const validateProductVariantsStep = createStep(
  validateProductVariantsStepId,
  async ({ variant_ids, variants }: ValidateProductVariantsStepInput) => {
    const found = new Set(
      (variants ?? []).map((variant) => variant?.id).filter(Boolean),
    )
    const missing = variant_ids.find((id) => !found.has(id))

    if (missing) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Variant with id ${missing} was not found`,
      )
    }

    return new StepResponse(void 0)
  },
)
