import { MedusaContainer } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

export const validateSellerFulfillmentSet = async (
  scope: MedusaContainer,
  sellerId: string,
  fulfillmentSetId: string
) => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [locationFulfillmentSet],
  } = await query.graph({
    entity: "location_fulfillment_set",
    filters: {
      fulfillment_set_id: fulfillmentSetId,
    },
    fields: ["stock_location_id"],
  })

  if (!locationFulfillmentSet) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Fulfillment set with id: ${fulfillmentSetId} was not found`
    )
  }

  const {
    data: [sellerStockLocation],
  } = await query.graph({
    entity: "stock_location_seller",
    filters: {
      stock_location_id: locationFulfillmentSet.stock_location_id,
      seller_id: sellerId,
    },
    fields: ["seller_id"],
  })

  if (!sellerStockLocation) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Fulfillment set with id: ${fulfillmentSetId} was not found`
    )
  }
}

/**
 * A service zone is the seller's when the warehouse its fulfillment set hangs
 * on is the seller's. Anything else (unknown zone, another seller's) reads as
 * not found.
 */
export const validateSellerServiceZone = async (
  scope: MedusaContainer,
  sellerId: string,
  serviceZoneId: string
) => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [serviceZone],
  } = await query.graph({
    entity: "service_zone",
    filters: { id: serviceZoneId },
    fields: ["fulfillment_set.location.id"],
  })

  const stockLocationId = (
    serviceZone as { fulfillment_set?: { location?: { id?: string } } }
  )?.fulfillment_set?.location?.id

  const sellerStockLocations = stockLocationId
    ? (
        await query.graph({
          entity: "stock_location_seller",
          filters: { stock_location_id: stockLocationId, seller_id: sellerId },
          fields: ["seller_id"],
        })
      ).data
    : []

  if (!sellerStockLocations.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Service zone with id: ${serviceZoneId} was not found`
    )
  }
}

export const refetchFulfillmentSet = async (
  scope: MedusaContainer,
  fulfillmentSetId: string,
  fields: string[]
) => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [fulfillmentSet],
  } = await query.graph({
    entity: "fulfillment_set",
    filters: { id: fulfillmentSetId },
    fields,
  })

  return fulfillmentSet
}
