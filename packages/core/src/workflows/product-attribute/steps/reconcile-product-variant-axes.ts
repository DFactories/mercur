import type {
  IProductModuleService,
  MedusaContainer,
} from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import { loadProductAxisState } from "../utils/load-product-axis-state"
import {
  AXIS_IN_USE_MESSAGE,
  type AxisVariant,
  DEFAULT_OPTION_TITLE,
  DEFAULT_OPTION_VALUE,
  planAxisDetach,
  planVariantAxisReconcile,
  type VariantAxisPlan,
} from "../utils/variant-axes"

type AppliedAxisPlan = {
  product_id: string
  previous_option_ids: string[]
  previous_variants: AxisVariant[]
  created_option_id: string | null
  detached_exclusive_option_ids: string[]
}

const applyAxisPlan = async (
  container: MedusaContainer,
  productId: string,
  previous: { option_ids: string[]; exclusive_ids: string[]; variants: AxisVariant[] },
  plan: VariantAxisPlan,
): Promise<AppliedAxisPlan> => {
  const productModule = container.resolve<IProductModuleService>(
    Modules.PRODUCT,
  )

  let createdOptionId: string | null = null
  if (plan.create_default) {
    const option = await productModule.createProductOptions({
      title: DEFAULT_OPTION_TITLE,
      values: [DEFAULT_OPTION_VALUE],
      is_exclusive: true,
    })
    createdOptionId = option.id
  }

  const optionIds = createdOptionId
    ? [...plan.option_ids, createdOptionId]
    : plan.option_ids

  await productModule.updateProducts(productId, {
    option_ids: optionIds,
    ...(plan.variants.length
      ? {
          variants: plan.variants.map((variant) => ({
            id: variant.id,
            options: variant.options,
          })),
        }
      : {}),
  })

  return {
    product_id: productId,
    previous_option_ids: previous.option_ids,
    previous_variants: previous.variants,
    created_option_id: createdOptionId,
    detached_exclusive_option_ids: previous.exclusive_ids.filter(
      (id) => !optionIds.includes(id),
    ),
  }
}

const revertAxisPlan = async (
  container: MedusaContainer,
  applied: AppliedAxisPlan | null | undefined,
) => {
  if (!applied) {
    return
  }

  const productModule = container.resolve<IProductModuleService>(
    Modules.PRODUCT,
  )

  if (applied.detached_exclusive_option_ids.length) {
    await productModule.restoreProductOptions(
      applied.detached_exclusive_option_ids,
    )
  }

  await productModule.updateProducts(applied.product_id, {
    option_ids: applied.previous_option_ids,
    ...(applied.previous_variants.length
      ? {
          variants: applied.previous_variants.map((variant) => ({
            id: variant.id,
            options: variant.options,
          })),
        }
      : {}),
  })

  if (applied.created_option_id) {
    await productModule.deleteProductOptions([applied.created_option_id])
  }
}

export const reconcileProductVariantAxesStepId =
  "pa-reconcile-product-variant-axes"

/**
 * Keeps a product's variants in step with its axes after attributes change:
 * the `__default__` placeholder goes once a real axis exists (and returns when
 * none is left), and a variant gains the first allowed value of an axis it has
 * no value for. Without this, a product imported with one variant and given
 * axes later could never have that variant saved again.
 */
export const reconcileProductVariantAxesStep = createStep(
  reconcileProductVariantAxesStepId,
  async (input: { product_id: string }, { container }) => {
    const state = await loadProductAxisState(container, input.product_id)
    const plan = planVariantAxisReconcile(state)

    if (!plan.changed) {
      return new StepResponse(void 0, null)
    }

    const applied = await applyAxisPlan(
      container,
      input.product_id,
      {
        option_ids: state.options.map((o) => o.id),
        exclusive_ids: state.options
          .filter((o) => o.is_exclusive)
          .map((o) => o.id),
        variants: state.variants,
      },
      plan,
    )

    return new StepResponse(void 0, applied)
  },
  async (applied, { container }) => {
    await revertAxisPlan(container, applied)
  },
)

export const detachVariantAxesFromProductStepId =
  "pa-detach-variant-axes-from-product"

/**
 * Takes axes off a product together with the values its variants hold for
 * them. Medusa refuses to unlink an option while variants use it, so the
 * option set and every variant are rewritten in one update. Refused when the
 * variants still differ on an axis, since dropping it would leave duplicates.
 */
export const detachVariantAxesFromProductStep = createStep(
  detachVariantAxesFromProductStepId,
  async (
    input: { product_id: string; product_option_ids: string[] },
    { container },
  ) => {
    if (!input.product_option_ids.length) {
      return new StepResponse(void 0, null)
    }

    const state = await loadProductAxisState(container, input.product_id)
    const attached = new Set(state.options.map((o) => o.id))
    const detach = input.product_option_ids.filter((id) => attached.has(id))

    if (!detach.length) {
      return new StepResponse(void 0, null)
    }

    const { blocking, plan } = planAxisDetach({
      ...state,
      detach_option_ids: detach,
    })

    if (blocking.length) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, AXIS_IN_USE_MESSAGE)
    }

    const applied = await applyAxisPlan(
      container,
      input.product_id,
      {
        option_ids: state.options.map((o) => o.id),
        exclusive_ids: state.options
          .filter((o) => o.is_exclusive)
          .map((o) => o.id),
        variants: state.variants,
      },
      plan,
    )

    return new StepResponse(void 0, applied)
  },
  async (applied, { container }) => {
    await revertAxisPlan(container, applied)
  },
)

export const validateVariantAxesDetachableStepId =
  "pa-validate-variant-axes-detachable"

/**
 * The same refusal as {@link detachVariantAxesFromProductStep}, without the
 * change — so a queued request is refused when the store submits it, not when
 * an operator approves it.
 */
export const validateVariantAxesDetachableStep = createStep(
  validateVariantAxesDetachableStepId,
  async (
    input: { product_id: string; product_option_ids: string[] },
    { container },
  ) => {
    if (!input.product_option_ids.length) {
      return new StepResponse(void 0)
    }

    const state = await loadProductAxisState(container, input.product_id)
    const { blocking } = planAxisDetach({
      ...state,
      detach_option_ids: input.product_option_ids,
    })

    if (blocking.length) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, AXIS_IN_USE_MESSAGE)
    }

    return new StepResponse(void 0)
  },
)
