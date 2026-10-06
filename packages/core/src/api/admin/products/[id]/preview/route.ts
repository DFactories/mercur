import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  ProductChangeActionDTO,
  ProductChangeDTO,
  ProductChangeStatus,
} from "@mercurjs/types"

import { withCollapsedActions } from "../../../../../workflows/product-edit/utils/collapse-product-change-actions"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<{ product_change: ProductChangeDTO | null }>,
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const productId = req.params.id

  const { data: changes } = await query.graph({
    entity: "product_change",
    fields: ["*", "actions.*"],
    filters: {
      product_id: productId,
      status: ProductChangeStatus.PENDING,
    },
  })

  const change = changes[0] as
    | (ProductChangeDTO & { actions?: ProductChangeActionDTO[] })
    | undefined

  res.json({ product_change: change ? withCollapsedActions(change) : null })
}
