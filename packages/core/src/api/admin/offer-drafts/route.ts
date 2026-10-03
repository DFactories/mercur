import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { createOfferDraftsWorkflow } from "../../../workflows/offer"
import { OFFER_DRAFT_FIELDS, toOfferDraftResponse } from "./helpers"
import {
  AdminCreateOfferDraftsType,
  AdminGetOfferDraftsParamsType,
} from "./validators"

type DraftRow = Parameters<typeof toOfferDraftResponse>[0]

export const GET = async (
  req: AuthenticatedMedusaRequest<AdminGetOfferDraftsParamsType>,
  res: MedusaResponse
) => {
  const {
    seller_id,
    product_id,
    variant_id,
    external_id,
    status,
    limit = 50,
    offset = 0,
  } = (req.validatedQuery ?? {}) as AdminGetOfferDraftsParamsType

  const filters: Record<string, unknown> = {}
  if (seller_id) filters.seller_id = seller_id
  if (product_id) filters.product_id = product_id
  if (variant_id) filters.variant_id = variant_id
  if (external_id) filters.external_id = external_id
  if (status) filters.status = status

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data, metadata } = await query.graph({
    entity: "offer_draft",
    fields: OFFER_DRAFT_FIELDS,
    filters,
    pagination: { skip: offset, take: limit, order: { created_at: "DESC" } },
  })

  res.json({
    offer_drafts: (data as DraftRow[]).map(toOfferDraftResponse),
    count: metadata?.count ?? data.length,
    offset,
    limit,
  })
}

/**
 * Up to 100 drafts; each one answered in request order as `created`,
 * `existing` or `refused` with a stable code, so the status is 200 whenever
 * the body was valid.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<AdminCreateOfferDraftsType>,
  res: MedusaResponse
) => {
  const { result } = await createOfferDraftsWorkflow(req.scope).run({
    input: {
      drafts: req.validatedBody.offer_drafts.map((draft) => ({
        seller_id: draft.seller_id,
        product_id: draft.product_id,
        variant_id: draft.variant_id,
        external_id: draft.external_id,
        metadata: draft.metadata ?? null,
      })),
      created_by: req.auth_context?.actor_id ?? null,
    },
  })

  const ids = result
    .map((item) => (item.outcome === "refused" ? null : item.draft.id))
    .filter((id): id is string => !!id)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = ids.length
    ? await query.graph({
        entity: "offer_draft",
        fields: OFFER_DRAFT_FIELDS,
        filters: { id: ids },
      })
    : { data: [] as DraftRow[] }
  const byId = new Map(
    (data as DraftRow[]).map((row) => [row.id, toOfferDraftResponse(row)])
  )

  const summary = { created: 0, existing: 0, refused: 0 }
  const results = result.map((item) => {
    summary[item.outcome] += 1
    const base = {
      index: item.index,
      external_id: item.external_id,
      variant_id: item.variant_id,
      outcome: item.outcome,
    }
    return item.outcome === "refused"
      ? { ...base, error: item.error }
      : { ...base, offer_draft: byId.get(item.draft.id) ?? null }
  })

  res.json({ results, summary })
}
