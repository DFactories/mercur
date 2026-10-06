import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  promiseAll,
} from "@medusajs/framework/utils"
import { BatchMethodRequest } from "@medusajs/framework/types"
import { batchPriceListPricesWorkflow } from "@medusajs/core-flows"
import { HttpTypes } from "@mercurjs/types"

import {
  fetchPriceListPricesById,
  scopePricesToSellerOffers,
  scopePriceUpdatesToSellerOffers,
  validateSellerPriceList,
} from "../../../helpers"
import { vendorPriceListPriceFields } from "../../../query-config"
import {
  VendorCreatePriceListPriceType,
  VendorUpdatePriceListPriceType,
} from "../../../validators"

const listPrices = async (
  ids: string[],
  scope: any,
  fields: string[]
) => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "price",
    filters: { id: ids },
    fields,
  })
  return data
}

export const POST = async (
  req: AuthenticatedMedusaRequest<
    BatchMethodRequest<
      VendorCreatePriceListPriceType,
      VendorUpdatePriceListPriceType
    >
  >,
  res: MedusaResponse<HttpTypes.VendorPriceListBatchResponse>
) => {
  const id = req.params.id
  const sellerId = req.seller_context!.seller_id

  await validateSellerPriceList(req.scope, sellerId, id)

  const {
    create: createInput = [],
    update: updateInput = [],
    delete: deletePriceIds = [],
  } = req.validatedBody

  const [create, update] = await promiseAll([
    scopePricesToSellerOffers(req.scope, sellerId, createInput),
    scopePriceUpdatesToSellerOffers(req.scope, sellerId, id, updateInput),
    fetchPriceListPricesById(req.scope, id, deletePriceIds),
  ])

  const workflow = batchPriceListPricesWorkflow(req.scope)
  const { result } = await workflow.run({
    input: {
      data: {
        id,
        create,
        update,
        delete: deletePriceIds,
      },
    },
  })

  const [created, updated] = await promiseAll([
    listPrices(
      result.created.map((c) => c.id),
      req.scope,
      vendorPriceListPriceFields
    ),
    listPrices(
      result.updated.map((c) => c.id),
      req.scope,
      vendorPriceListPriceFields
    ),
  ])

  res.status(200).json({
    created,
    updated,
    deleted: {
      id: deletePriceIds,
      object: "price",
      deleted: true,
    },
  })
}
