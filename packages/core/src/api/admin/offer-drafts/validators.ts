import { z } from "zod"

// `external_id` is required: it is the idempotency key, and a draft without one
// could be created twice by a retried request.
const AdminOfferDraftItem = z
  .object({
    seller_id: z.string().trim().min(1),
    product_id: z.string().trim().min(1),
    variant_id: z
      .string()
      .trim()
      .min(1)
      .nullish()
      .transform((value) => value ?? null),
    external_id: z.string().trim().min(1).max(255),
    metadata: z.record(z.string(), z.unknown()).nullish(),
  })
  .strict()

export type AdminCreateOfferDraftsType = z.infer<typeof AdminCreateOfferDrafts>
export const AdminCreateOfferDrafts = z
  .object({
    offer_drafts: z.array(AdminOfferDraftItem).min(1).max(100),
  })
  .strict()

const oneOrMany = z
  .union([z.string().min(1), z.array(z.string().min(1))])
  .optional()

export type AdminGetOfferDraftsParamsType = z.infer<
  typeof AdminGetOfferDraftsParams
>
export const AdminGetOfferDraftsParams = z
  .object({
    seller_id: oneOrMany,
    product_id: oneOrMany,
    variant_id: oneOrMany,
    external_id: oneOrMany,
    status: z.enum(["open", "completed"]).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict()
