import { model } from "@medusajs/framework/utils"

/**
 * "Store X sells product/variant Y" with no price, stock, SKU or shipping
 * profile yet — what the supplier importer can know about a producer that sells
 * an existing master product.
 *
 * A model of its own, not a status on `Offer`: every buyer path reads `offer`,
 * so a draft cannot reach a store route, a cart, checkout, a quote or the search
 * index by forgetting a filter. A draft becomes an offer only through the offer
 * routes, with their checks; `createOffersWorkflow` then closes it.
 *
 * `variant_id` null is a draft for the whole product: the seller picks the
 * variants when completing it. A completed draft is kept, so the importer
 * re-sending its key is told "done" instead of getting a new draft.
 */
const OfferDraft = model
  .define("offer_draft", {
    id: model.id({ prefix: "odraft" }).primaryKey(),
    seller_id: model.text(),
    product_id: model.text(),
    variant_id: model.text().nullable(),
    external_id: model.text().nullable(),
    status: model.enum(["open", "completed"]).default("open"),
    completed_offer_id: model.text().nullable(),
    completed_at: model.dateTime().nullable(),
    created_by: model.text().nullable(),
    metadata: model.json().nullable(),
  })
  .indexes([
    {
      name: "IDX_offer_draft_seller_id",
      on: ["seller_id"],
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_offer_draft_product_id",
      on: ["product_id"],
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_offer_draft_external_variant_unique",
      on: ["external_id", "variant_id"],
      unique: true,
      where:
        "deleted_at IS NULL AND external_id IS NOT NULL AND variant_id IS NOT NULL",
    },
    {
      // NULLs are distinct in a unique index, so the whole-product row needs
      // its own.
      name: "IDX_offer_draft_external_product_unique",
      on: ["external_id"],
      unique: true,
      where:
        "deleted_at IS NULL AND external_id IS NOT NULL AND variant_id IS NULL",
    },
    {
      name: "IDX_offer_draft_open_seller_variant_unique",
      on: ["seller_id", "variant_id"],
      unique: true,
      where:
        "deleted_at IS NULL AND status = 'open' AND variant_id IS NOT NULL",
    },
    {
      name: "IDX_offer_draft_open_seller_product_unique",
      on: ["seller_id", "product_id"],
      unique: true,
      where: "deleted_at IS NULL AND status = 'open' AND variant_id IS NULL",
    },
  ])

export default OfferDraft
