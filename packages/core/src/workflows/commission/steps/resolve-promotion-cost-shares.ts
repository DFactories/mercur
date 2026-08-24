import { StepResponse, createStep } from "@medusajs/framework/workflows-sdk"
import { MathBN } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"

import { MercurModules } from "@mercurjs/types"

import PromotionCostModuleService from "../../../modules/promotion-cost/service"

export const resolvePromotionCostSharesStepId = "resolve-promotion-cost-shares"

/**
 * Resolve, per promotion, the fraction of its discount the marketplace absorbs.
 *
 * A promotion with no `promotion_cost` record is treated as `marketplace` — the
 * marketplace covers its share and commission lands on the post-discount amount.
 * That is deliberately NOT the column's own `store` default: the operator has to
 * opt in to making the seller carry the whole discount, rather than getting that
 * by saying nothing.
 *
 * Exported as a plain function as well as a step, because it is not only the
 * commission workflow that has to agree on this number. Anything else that bills
 * a seller against a discounted line — dfactories-mp's agent referral commission
 * is the live case — needs the same map, and the alternative is each consumer
 * walking order item -> promotion -> promotion_cost itself and drifting the first
 * time the resolution rules change here.
 */
export const resolvePromotionCostShares = async (
  container: MedusaContainer,
  promotionIds: string[]
): Promise<Record<string, number>> => {
  const shares: Record<string, number> = {}

  const ids = [...new Set((promotionIds ?? []).filter(Boolean))]
  if (!ids.length) {
    return shares
  }

  const service = container.resolve(
    MercurModules.PROMOTION_COST
  ) as PromotionCostModuleService

  const costs = await service.listPromotionCosts({ promotion_id: ids })
  const byPromotion = new Map(costs.map((c) => [c.promotion_id, c]))

  for (const id of ids) {
    const cost = byPromotion.get(id)

    if (!cost || cost.cost_bearer === "marketplace") {
      shares[id] = 1
      continue
    }

    if (cost.cost_bearer === "store") {
      shares[id] = 0
      continue
    }

    // shared: the record carries the marketplace's percentage; a missing or
    // out-of-range value falls back to the marketplace covering its share,
    // which is the same as having no record at all.
    const pct = cost.shared_marketplace_percentage
    shares[id] =
      pct === null || pct === undefined
        ? 1
        : Math.min(1, Math.max(0, MathBN.convert(pct).toNumber() / 100))
  }

  return shares
}

export const resolvePromotionCostSharesStep = createStep(
  resolvePromotionCostSharesStepId,
  async (
    promotionIds: string[],
    { container }
  ): Promise<StepResponse<Record<string, number>>> => {
    return new StepResponse(
      await resolvePromotionCostShares(container, promotionIds)
    )
  }
)
