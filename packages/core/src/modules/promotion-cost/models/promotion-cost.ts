import { model } from "@medusajs/framework/utils"

const PromotionCost = model
  .define("PromotionCost", {
    id: model.id({ prefix: "promcost" }).primaryKey(),
    promotion_id: model.text(),
    // This column default is upstream's and is NOT the rule commission follows: a
    // promotion with no promotion_cost row at all is treated as `marketplace`, so
    // the seller only carries the whole discount when an operator says so. The
    // default is unreachable today because UpsertPromotionCostDTO.cost_bearer is
    // required -- every supported write states its bearer. If that field is ever
    // relaxed to optional, this default starts silently contradicting the rule.
    cost_bearer: model.enum(["store", "marketplace", "shared"]).default("store"),
    shared_marketplace_percentage: model.number().nullable(),
    metadata: model.json().nullable(),
  })
  .indexes([
    {
      name: "IDX_promotion_cost_promotion_id_unique",
      on: ["promotion_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])

export default PromotionCost
