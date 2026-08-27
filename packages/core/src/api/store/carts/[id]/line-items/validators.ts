import { z } from "zod"

/**
 * What a store client may put on a cart line: an offer and a quantity.
 *
 * NO PRICE, AND THAT IS THE POINT. The route spreads whatever survives this
 * schema into `addToCartWorkflow`, so a declared `unit_price` is an honoured
 * one — a shopper could name their own price by adding a field to a request.
 * The price belongs to the seller's offer and is resolved server-side.
 *
 * `.strict()` turns the ABSENCE of these fields into an active refusal rather
 * than a silent drop: a client that sends a price is told it may not, instead
 * of being quietly overcharged or undercharged and finding out at checkout.
 */
export const StoreAddCartLineItem = z
  .object({
    offer_id: z.string().min(1, "offer_id is required"),
    quantity: z.number().int().positive(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    additional_data: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()

export type StoreAddCartLineItemType = z.infer<typeof StoreAddCartLineItem>
