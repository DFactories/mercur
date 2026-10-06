import type { IProductModuleService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MercurModules } from "@mercurjs/types"

import type ProductAttributeModuleService from "../../../modules/product-attribute/service"

export type ScopedAxisValuesPlan = {
  attribute_id: string
  product_option_id: string
  add_names: string[]
  /** Attribute value ids to drop. */
  remove_value_ids: string[]
}

type AppliedScopedAxis = {
  product_id: string
  attribute_id: string
  product_option_id: string
  previous_names: string[]
  removed_value_ids: string[]
  removed_option_value_ids: string[]
  created_value_ids: string[]
  attached_option_value_ids: string[]
}

export type SyncScopedAxisValuesStepOutput = {
  created_value_ids: string[]
  removed_value_ids: string[]
}

const optionValues = async (
  productModule: IProductModuleService,
  optionId: string,
) => {
  const option = await productModule.retrieveProductOption(optionId, {
    relations: ["values"],
  })
  return (option.values ?? []) as { id: string; value: string }[]
}

export const syncScopedAxisValuesStepId = "pa-sync-scoped-axis-values"

/**
 * Adds and removes the values of product-scoped axes, for any number of them
 * at once — a request that collects several saves can touch more than one.
 * A new value is created on the attribute, mirrored onto the exclusive option
 * AND added to the product's allowed value subset; without the last part
 * Medusa refused every variant that tried to use it.
 */
export const syncScopedAxisValuesStep = createStep(
  syncScopedAxisValuesStepId,
  async (
    input: { product_id: string; plans: ScopedAxisValuesPlan[] },
    { container },
  ) => {
    const productModule = container.resolve<IProductModuleService>(
      Modules.PRODUCT,
    )
    const attributeService = container.resolve<ProductAttributeModuleService>(
      MercurModules.PRODUCT_ATTRIBUTE,
    )

    const applied: AppliedScopedAxis[] = []

    for (const plan of input.plans) {
      if (!plan.add_names.length && !plan.remove_value_ids.length) {
        continue
      }

      const before = await optionValues(productModule, plan.product_option_id)
      const previousNames = before.map((v) => v.value)
      const record: AppliedScopedAxis = {
        product_id: input.product_id,
        attribute_id: plan.attribute_id,
        product_option_id: plan.product_option_id,
        previous_names: previousNames,
        removed_value_ids: [],
        removed_option_value_ids: [],
        created_value_ids: [],
        attached_option_value_ids: [],
      }
      applied.push(record)

      const removing = plan.remove_value_ids.length
        ? ((await attributeService.listProductAttributeValues({
            id: plan.remove_value_ids,
            attribute_id: plan.attribute_id,
          })) as { id: string; name: string; product_option_value_id: string | null }[])
        : []
      const removedNames = new Set(removing.map((v) => v.name))
      const removedOptionValueIds = removing
        .map((v) => v.product_option_value_id)
        .filter((id): id is string => !!id)

      if (removedOptionValueIds.length) {
        await productModule.updateProductOptionValuesOnProduct([
          {
            product_id: input.product_id,
            product_option_id: plan.product_option_id,
            remove: removedOptionValueIds,
          },
        ])
        record.removed_option_value_ids = removedOptionValueIds
      }

      if (removing.length) {
        await attributeService.softDeleteProductAttributeValues(
          removing.map((v) => v.id),
        )
        record.removed_value_ids = removing.map((v) => v.id)
      }

      const kept = previousNames.filter((name) => !removedNames.has(name))
      const added = Array.from(
        new Set(plan.add_names.filter((name) => !kept.includes(name))),
      )
      const nextNames = [...kept, ...added]

      if (
        nextNames.length !== previousNames.length ||
        nextNames.some((name, i) => name !== previousNames[i])
      ) {
        await productModule.updateProductOptions(plan.product_option_id, {
          values: nextNames,
        })
      }

      if (!added.length) {
        continue
      }

      const after = await optionValues(productModule, plan.product_option_id)
      const idByName = new Map(after.map((v) => [v.value, v.id]))
      const attach = added
        .map((name) => idByName.get(name))
        .filter((id): id is string => !!id)

      if (attach.length) {
        await productModule.updateProductOptionValuesOnProduct([
          {
            product_id: input.product_id,
            product_option_id: plan.product_option_id,
            add: attach,
          },
        ])
        record.attached_option_value_ids = attach
      }

      const created = (await attributeService.createProductAttributeValues(
        added.map((name) => ({
          attribute_id: plan.attribute_id,
          name,
          product_option_value_id: idByName.get(name) ?? null,
        })),
      )) as { id: string }[]
      record.created_value_ids = created.map((v) => v.id)
    }

    return new StepResponse<SyncScopedAxisValuesStepOutput, AppliedScopedAxis[]>(
      {
        created_value_ids: applied.flatMap((a) => a.created_value_ids),
        removed_value_ids: applied.flatMap((a) => a.removed_value_ids),
      },
      applied,
    )
  },
  async (applied, { container }) => {
    if (!applied?.length) {
      return
    }

    const productModule = container.resolve<IProductModuleService>(
      Modules.PRODUCT,
    )
    const attributeService = container.resolve<ProductAttributeModuleService>(
      MercurModules.PRODUCT_ATTRIBUTE,
    )

    for (const record of [...applied].reverse()) {
      if (record.created_value_ids.length) {
        await attributeService.deleteProductAttributeValues(
          record.created_value_ids,
        )
      }
      if (record.attached_option_value_ids.length) {
        await productModule.updateProductOptionValuesOnProduct([
          {
            product_id: record.product_id,
            product_option_id: record.product_option_id,
            remove: record.attached_option_value_ids,
          },
        ])
      }
      await productModule.updateProductOptions(record.product_option_id, {
        values: record.previous_names,
      })
      if (!record.removed_value_ids.length) {
        continue
      }

      await attributeService.restoreProductAttributeValues(
        record.removed_value_ids,
      )
      const restored = (await attributeService.listProductAttributeValues({
        id: record.removed_value_ids,
      })) as { id: string; name: string }[]
      const idByName = new Map(
        (await optionValues(productModule, record.product_option_id)).map(
          (v) => [v.value, v.id],
        ),
      )
      await attributeService.updateProductAttributeValues(
        restored.map((v) => ({
          id: v.id,
          product_option_value_id: idByName.get(v.name) ?? null,
        })),
      )
      const reattach = restored
        .map((v) => idByName.get(v.name))
        .filter((id): id is string => !!id)
      if (reattach.length) {
        await productModule.updateProductOptionValuesOnProduct([
          {
            product_id: record.product_id,
            product_option_id: record.product_option_id,
            add: reattach,
          },
        ])
      }
    }
  },
)
