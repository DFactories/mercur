import i18n from "i18next";
import { iranMobileSchema, optionalIranMobileSchema } from "@mercurjs/dashboard-shared";
import { z } from "zod";

export const CreateStoreSchema = z.object({
  name: z
    .string()
    .min(1, { message: i18n.t("stores.create.validation.nameRequired") }),
  email: z
    .string()
    .min(1, { message: i18n.t("stores.create.validation.emailRequired") })
    .email({ message: i18n.t("stores.create.validation.emailInvalid") }),
  phone: optionalIranMobileSchema(
    i18n.t("stores.create.validation.phoneInvalid"),
  ),
  currency_code: z
    .string()
    .min(1, { message: i18n.t("stores.create.validation.currencyRequired") }),
  handle: z.string().optional().or(z.literal("")),
  // The person this store is being created FOR. They receive the initial
  // Seller Administration invite, and because a store created here has no seat
  // until someone accepts, they become its owner.
  //
  // A phone, not an email: vendors sign in with an OTP, so an operator
  // creating a store for a real producer had to invent an address, then cancel
  // the invite it produced and send a second one by phone. Matches the "add
  // user" form, which has always been phone-first.
  member_phone: iranMobileSchema(
    i18n.t("stores.create.validation.memberPhoneInvalid"),
    i18n.t("stores.create.validation.memberPhoneRequired"),
  ),
});

export type CreateStoreSchemaType = z.infer<typeof CreateStoreSchema>;
