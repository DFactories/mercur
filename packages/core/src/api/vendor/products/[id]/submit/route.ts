import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { HttpTypes } from "@mercurjs/types"

import { submitProductForReviewWorkflow } from "../../../../../workflows/product/workflows/submit-product-for-review"
import { enrichProductAttributes } from "../../../../utils"

/**
 * POST /vendor/products/:id/submit — send a draft or rejected product in for
 * review. Ownership is enforced by the route's middleware.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<HttpTypes.VendorProductResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  await submitProductForReviewWorkflow(req.scope).run({
    input: {
      product_id: req.params.id,
      actor_id: req.seller_context!.seller_id,
    },
  })

  const {
    data: [product],
  } = await query.graph({
    entity: "product",
    fields: req.queryConfig.fields,
    filters: { id: req.params.id },
  })

  await enrichProductAttributes(req.scope, [product])

  res.json({ product })
}
