import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

import { rejectProductChangeWorkflow } from "../../../../../workflows/product-edit/workflows/reject-product-change"
import { AdminRejectProductChangeType } from "../../validators"

export const POST = async (
  req: AuthenticatedMedusaRequest<AdminRejectProductChangeType>,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  await rejectProductChangeWorkflow(req.scope).run({
    input: {
      id: req.params.id,
      declined_by: req.auth_context?.actor_id,
      declined_reason: req.validatedBody?.reason,
      additional_data: req.validatedBody?.additional_data,
    },
  })

  const {
    data: [product_change],
  } = await query.graph({
    entity: "product_change",
    fields: ["*", "actions.*"],
    filters: { id: req.params.id },
  })

  if (!product_change) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Product change with id ${req.params.id} was not found`
    )
  }

  res.json({ product_change })
}
