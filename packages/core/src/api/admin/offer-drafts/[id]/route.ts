import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

import { deleteOfferDraftsWorkflow } from "../../../../workflows/offer"
import { OFFER_DRAFT_FIELDS, toOfferDraftResponse } from "../helpers"

const loadDraft = async (req: AuthenticatedMedusaRequest) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [draft],
  } = await query.graph({
    entity: "offer_draft",
    fields: OFFER_DRAFT_FIELDS,
    filters: { id: req.params.id },
  })
  if (!draft) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Offer draft with id ${req.params.id} was not found`
    )
  }
  return draft as Parameters<typeof toOfferDraftResponse>[0]
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  res.json({ offer_draft: toOfferDraftResponse(await loadDraft(req)) })
}

// Deleting frees the key; a completed draft's offer stays.
export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const draft = await loadDraft(req)
  await deleteOfferDraftsWorkflow(req.scope).run({
    input: { ids: [draft.id as string] },
  })
  res.json({ id: draft.id, object: "offer_draft", deleted: true })
}
