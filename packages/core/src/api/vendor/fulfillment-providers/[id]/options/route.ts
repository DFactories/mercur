import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: providers } = await query.graph({
    entity: "fulfillment_provider",
    fields: ["id"],
    filters: { id: req.params.id, is_enabled: true },
  })

  if (!providers.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Fulfillment provider with id: ${req.params.id} was not found`
    )
  }

  const fulfillmentModule = req.scope.resolve(Modules.FULFILLMENT)
  const fulfillment_options =
    await fulfillmentModule.retrieveFulfillmentOptions(req.params.id)

  res.json({
    fulfillment_options,
    count: fulfillment_options.length,
    limit: fulfillment_options.length,
    offset: 0,
  })
}
