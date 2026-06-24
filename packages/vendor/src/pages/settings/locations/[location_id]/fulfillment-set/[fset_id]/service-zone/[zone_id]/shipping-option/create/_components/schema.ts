import { z } from "zod"
import { ShippingOptionPriceType } from "@pages/settings/locations/_common/constants"
import { ConditionalPriceSchema } from "@pages/settings/locations/_common/schema"

export type CreateShippingOptionSchema = z.infer<
  typeof CreateShippingOptionSchema
>

export const CreateShippingOptionDetailsSchema = z.object({
  name: z.string().min(1),
  price_type: z.nativeEnum(ShippingOptionPriceType),
  enabled_in_store: z.boolean(),
  shipping_profile_id: z.string().min(1),
  provider_id: z.string().min(1),
  fulfillment_option_id: z.string().optional(),
  // Estimated delivery time in whole days (string in the form; cast to a number
  // on submit). Optional — drives the settlement return-window floor.
  estimated_delivery_days: z
    .string()
    .optional()
    .refine(
      (v) => !v || (/^\d+$/.test(v) && Number(v) >= 0 && Number(v) <= 365),
      { message: "Enter a whole number of days (0–365)" }
    ),
})

export const ShippingOptionConditionalPriceSchema = z.object({
  conditional_region_prices: z.record(
    z.string(),
    z.array(ConditionalPriceSchema).optional()
  ),
  conditional_currency_prices: z.record(
    z.string(),
    z.array(ConditionalPriceSchema).optional()
  ),
})

export type ShippingOptionConditionalPriceSchemaType = z.infer<
  typeof ShippingOptionConditionalPriceSchema
>

export const CreateShippingOptionSchema = z
  .object({
    region_prices: z.record(z.string(), z.string().optional()),
    currency_prices: z.record(z.string(), z.string().optional()),
  })
  .merge(CreateShippingOptionDetailsSchema)
  .merge(ShippingOptionConditionalPriceSchema)

export type CreateShippingOptionSchemaType = z.infer<
  typeof CreateShippingOptionSchema
>
