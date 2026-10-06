import type { IProductModuleService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MercurModules } from "@mercurjs/types"

import type ProductAttributeModuleService from "../../../modules/product-attribute/service"

export type ScopedAttributeRename = {
  id: string
  name: string
  product_option_id: string | null
}

type PreviousName = ScopedAttributeRename

export const renameScopedAttributesStepId = "pa-rename-scoped-attributes"

/**
 * Renames product-scoped attributes, keeping an axis's option title in step
 * with its attribute name.
 */
export const renameScopedAttributesStep = createStep(
  renameScopedAttributesStepId,
  async (renames: ScopedAttributeRename[], { container }) => {
    if (!renames.length) {
      return new StepResponse(void 0, [] as PreviousName[])
    }

    const attributeService = container.resolve<ProductAttributeModuleService>(
      MercurModules.PRODUCT_ATTRIBUTE,
    )
    const productModule = container.resolve<IProductModuleService>(
      Modules.PRODUCT,
    )

    const current = (await attributeService.listProductAttributes({
      id: renames.map((r) => r.id),
    })) as { id: string; name: string }[]
    const previous: PreviousName[] = renames.map((r) => ({
      id: r.id,
      name: current.find((a) => a.id === r.id)?.name ?? r.name,
      product_option_id: r.product_option_id,
    }))

    await attributeService.updateProductAttributes(
      renames.map((r) => ({ id: r.id, name: r.name })),
    )
    for (const rename of renames) {
      if (rename.product_option_id) {
        await productModule.updateProductOptions(rename.product_option_id, {
          title: rename.name,
        })
      }
    }

    return new StepResponse(void 0, previous)
  },
  async (previous, { container }) => {
    if (!previous?.length) {
      return
    }

    const attributeService = container.resolve<ProductAttributeModuleService>(
      MercurModules.PRODUCT_ATTRIBUTE,
    )
    const productModule = container.resolve<IProductModuleService>(
      Modules.PRODUCT,
    )

    await attributeService.updateProductAttributes(
      previous.map((p) => ({ id: p.id, name: p.name })),
    )
    for (const p of previous) {
      if (p.product_option_id) {
        await productModule.updateProductOptions(p.product_option_id, {
          title: p.name,
        })
      }
    }
  },
)
