import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { HttpTypes } from "@mercurjs/types"

import { AdminCreateSellerType } from "./validators"
import { createSellersWorkflow } from "../../../workflows/seller"
import { resolveSellerIdsByPhone } from "../../utils/sellers"

/** Matches nothing, so a phone with no store returns an empty page rather than every store. */
const NO_MATCH = "__no_seller_matches_this_phone__"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<HttpTypes.AdminSellerListResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  // Searching a phone number resolves to ids — the store's own number OR the
  // sign-in number of anyone on its team — because `q` only ever searched the
  // seller's own columns and the owner's number lives on `member`.
  const { q, ...restFilters } = req.filterableFields as {
    q?: string
    id?: string | string[]
    [key: string]: unknown
  }

  let filters = req.filterableFields
  if (typeof q === "string" && q.trim()) {
    const phoneMatches = await resolveSellerIdsByPhone(req.scope, q)
    if (phoneMatches) {
      // Respect an id filter the caller already set rather than widening it.
      const existing = restFilters.id
        ? Array.isArray(restFilters.id)
          ? restFilters.id
          : [restFilters.id]
        : null
      const ids = existing
        ? phoneMatches.filter((id) => existing.includes(id))
        : phoneMatches

      filters = { ...restFilters, id: ids.length ? ids : [NO_MATCH] }
    }
  }

  const { data: sellers, metadata } = await query.graph({
    entity: "seller",
    fields: req.queryConfig.fields,
    filters,
    pagination: req.queryConfig.pagination,
  })

  res.json({
    sellers,
    count: metadata?.count ?? 0,
    offset: metadata?.skip ?? 0,
    limit: metadata?.take ?? 0,
  })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<AdminCreateSellerType>,
  res: MedusaResponse<HttpTypes.AdminSellerResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { additional_data, ...sellerData } = req.validatedBody

  const { result } = await createSellersWorkflow(req.scope).run({
    input: {
      sellers: [sellerData],
      additional_data,
    },
  })

  const {
    data: [seller],
  } = await query.graph({
    entity: "seller",
    fields: req.queryConfig.fields,
    filters: { id: (result as any[])[0].id },
  })

  res.status(201).json({ seller })
}