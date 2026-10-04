import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { MercurModules, ProductStatus } from "@mercurjs/types"

import OfferModuleService from "../../../modules/offer/service"
import {
  CreateOfferDraftInput,
  CreateOfferDraftOutcome,
  OfferDraftRefusal,
  OfferDraftRefusals,
  outcomeForKey,
} from "../../../modules/offer/offer-draft-rules"
import { getProductIdsAccessibleToSeller } from "../../../api/vendor/products/helpers"

export type CreateOfferDraftsStepInput = {
  drafts: Omit<CreateOfferDraftInput, "created_by">[]
  created_by: string | null
}

export type CreateOfferDraftResult = CreateOfferDraftOutcome & {
  index: number
  external_id: string
  variant_id: string | null
}

const refused = (
  code: OfferDraftRefusal["code"],
  message: string
): CreateOfferDraftOutcome => ({ outcome: "refused", error: { code, message } })

const findActiveOfferIds = async (
  container: MedusaContainer,
  draft: { seller_id: string; product_id: string; variant_id: string | null }
): Promise<string[]> => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "offer",
    fields: ["id"],
    filters: draft.variant_id
      ? { seller_id: draft.seller_id, variant_id: draft.variant_id }
      : { seller_id: draft.seller_id, product_id: draft.product_id },
  })
  return (data as { id: string }[]).map((offer) => offer.id)
}

// The lock covers one key and one (seller, product); the same key sent for
// another store at the same moment is left to the unique index.
const isUniqueViolation = (error: unknown) =>
  error instanceof MedusaError && /already exists/i.test(error.message)

const unique = (values: (string | null)[]) =>
  [...new Set(values.filter((v): v is string => !!v))]

/**
 * Each draft is answered on its own — `created`, `existing` or `refused` — so
 * one stale mapping in an importer batch does not hold back the rest. The key
 * decides first, then the catalogue, then the core rule for which products a
 * seller may offer on, so a draft is never created that could not be completed.
 */
export const createOfferDraftsStep = createStep(
  "create-offer-drafts",
  async (input: CreateOfferDraftsStepInput, { container }) => {
    const service = container.resolve<OfferModuleService>(MercurModules.OFFER)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    const sellerIds = unique(input.drafts.map((d) => d.seller_id))
    const productIds = unique(input.drafts.map((d) => d.product_id))
    const variantIds = unique(input.drafts.map((d) => d.variant_id))

    const [sellers, products, variants] = await Promise.all([
      query.graph({ entity: "seller", fields: ["id"], filters: { id: sellerIds } }),
      query.graph({ entity: "product", fields: ["id", "status"], filters: { id: productIds } }),
      variantIds.length
        ? query.graph({
            entity: "product_variant",
            fields: ["id", "product_id"],
            filters: { id: variantIds },
          })
        : Promise.resolve({ data: [] }),
    ])
    const knownSellers = new Set((sellers.data as { id: string }[]).map((s) => s.id))
    const knownProducts = new Set((products.data as { id: string }[]).map((p) => p.id))
    // Checked here and not left to the seller's visibility rule: that rule also
    // shows a store the unpublished products an operator made for it, and a
    // draft must still be completable into an offer a buyer can reach.
    const publishedProducts = new Set(
      (products.data as { id: string; status: string }[])
        .filter((p) => p.status === ProductStatus.PUBLISHED)
        .map((p) => p.id)
    )
    const productByVariant = new Map(
      (variants.data as { id: string; product_id: string }[]).map((v) => [
        v.id,
        v.product_id,
      ])
    )

    const accessibleBySeller = new Map<string, Set<string>>()
    for (const sellerId of sellerIds.filter((id) => knownSellers.has(id))) {
      const ids = unique(
        input.drafts
          .filter((d) => d.seller_id === sellerId && knownProducts.has(d.product_id))
          .map((d) => d.product_id)
      )
      accessibleBySeller.set(
        sellerId,
        await getProductIdsAccessibleToSeller(container, sellerId, ids)
      )
    }

    const validate = (
      draft: CreateOfferDraftsStepInput["drafts"][number]
    ): CreateOfferDraftOutcome | null => {
      if (!knownSellers.has(draft.seller_id)) {
        return refused(
          OfferDraftRefusals.SELLER_NOT_FOUND,
          `Seller ${draft.seller_id} was not found`
        )
      }
      if (!knownProducts.has(draft.product_id)) {
        return refused(
          OfferDraftRefusals.PRODUCT_NOT_FOUND,
          `Product ${draft.product_id} was not found`
        )
      }
      if (draft.variant_id) {
        const owner = productByVariant.get(draft.variant_id)
        if (!owner) {
          return refused(
            OfferDraftRefusals.VARIANT_NOT_FOUND,
            `Variant ${draft.variant_id} was not found`
          )
        }
        if (owner !== draft.product_id) {
          return refused(
            OfferDraftRefusals.VARIANT_NOT_IN_PRODUCT,
            `Variant ${draft.variant_id} belongs to product ${owner}, not ${draft.product_id}`
          )
        }
      }
      if (
        !publishedProducts.has(draft.product_id) ||
        !accessibleBySeller.get(draft.seller_id)?.has(draft.product_id)
      ) {
        return refused(
          OfferDraftRefusals.PRODUCT_NOT_OFFERABLE,
          `Seller ${draft.seller_id} cannot offer on product ${draft.product_id}: it is not published, or it is restricted to other stores`
        )
      }
      return null
    }

    const results: CreateOfferDraftResult[] = []
    const createdIds: string[] = []

    for (const [index, draft] of input.drafts.entries()) {
      const run = async (): Promise<CreateOfferDraftOutcome> => {
        const keyed = outcomeForKey(
          await service.listOfferDraftsByKey(draft.external_id),
          draft
        )
        if (keyed) {
          return keyed
        }
        const invalid = validate(draft)
        if (invalid) {
          return invalid
        }
        return service.createOrGetOfferDraft(
          { ...draft, created_by: input.created_by },
          () => findActiveOfferIds(container, draft)
        )
      }

      let outcome: CreateOfferDraftOutcome
      try {
        outcome = await run()
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error
        }
        outcome = await run()
      }

      if (outcome.outcome === "created") {
        createdIds.push(outcome.draft.id)
      }
      results.push({
        index,
        external_id: draft.external_id,
        variant_id: draft.variant_id,
        ...outcome,
      })
    }

    return new StepResponse(results, createdIds)
  },
  async (createdIds: string[] | undefined, { container }) => {
    if (!createdIds?.length) {
      return
    }
    const service = container.resolve<OfferModuleService>(MercurModules.OFFER)
    await service.deleteOfferDrafts(createdIds)
  }
)
