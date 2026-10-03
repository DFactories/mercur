import {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaResponse,
  MiddlewareRoute,
} from "@medusajs/framework/http"
import {
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework"

import { ensureSellerCanOfferOnVariants } from "../products/helpers"
import { vendorOfferQueryConfig } from "./query-config"
import {
  VendorBatchOfferInventoryItems,
  VendorCreateOffer,
  VendorCreateOffersBatch,
  VendorGetOfferParams,
  VendorGetOffersParams,
  VendorUpdateOffer,
} from "./validators"

/**
 * An offer may only be opened on a product the seller can reach — the same
 * rule `GET /vendor/products` lists by. See {@link ensureSellerCanOfferOnVariants}.
 * Runs after body validation, so the variant ids it reads are well-formed.
 */
const ensureSellerCanOffer = async (
  req: AuthenticatedMedusaRequest<
    { variant_id?: string; offers?: { variant_id: string }[] }
  >,
  _res: MedusaResponse,
  next: MedusaNextFunction
) => {
  const body = req.validatedBody
  const variantIds = body.offers
    ? body.offers.map((offer) => offer.variant_id)
    : [body.variant_id as string]

  await ensureSellerCanOfferOnVariants(
    req.scope,
    req.seller_context!.seller_id,
    variantIds
  )

  return next()
}

const applySellerOfferFilter = (
  req: AuthenticatedMedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) => {
  req.filterableFields.seller_id = req.seller_context!.seller_id
  next()
}

export const vendorOffersMiddlewares: MiddlewareRoute[] = [
  {
    method: ["GET"],
    matcher: "/vendor/offers",
    middlewares: [
      validateAndTransformQuery(
        VendorGetOffersParams,
        vendorOfferQueryConfig.list
      ),
      applySellerOfferFilter,
    ],
  },
  {
    method: ["POST"],
    matcher: "/vendor/offers",
    middlewares: [
      validateAndTransformBody(VendorCreateOffer),
      ensureSellerCanOffer,
      validateAndTransformQuery(
        VendorGetOfferParams,
        vendorOfferQueryConfig.retrieve
      ),
    ],
  },
  {
    method: ["POST"],
    matcher: "/vendor/offers/batch",
    middlewares: [
      validateAndTransformBody(VendorCreateOffersBatch),
      ensureSellerCanOffer,
      validateAndTransformQuery(
        VendorGetOfferParams,
        vendorOfferQueryConfig.list
      ),
    ],
  },
  {
    method: ["GET"],
    matcher: "/vendor/offers/:id",
    middlewares: [
      validateAndTransformQuery(
        VendorGetOfferParams,
        vendorOfferQueryConfig.retrieve
      ),
    ],
  },
  {
    method: ["POST"],
    matcher: "/vendor/offers/:id",
    middlewares: [
      validateAndTransformBody(VendorUpdateOffer),
      validateAndTransformQuery(
        VendorGetOfferParams,
        vendorOfferQueryConfig.retrieve
      ),
    ],
  },
  {
    method: ["DELETE"],
    matcher: "/vendor/offers/:id",
    middlewares: [],
  },
  {
    method: ["POST"],
    matcher: "/vendor/offers/:id/inventory-items/batch",
    middlewares: [
      validateAndTransformBody(VendorBatchOfferInventoryItems),
      validateAndTransformQuery(
        VendorGetOfferParams,
        vendorOfferQueryConfig.retrieve
      ),
    ],
  },
]
