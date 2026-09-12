import { z } from "zod"

import { iranMobileField } from "../../utils/phone"

export type AdminUpdateCustomerPhoneType = z.infer<
  typeof AdminUpdateCustomerPhone
>
/**
 * The shopper's phone is their sign-in credential, so the operator panel is
 * held to exactly the same rule as the sign-up form: a number that cannot
 * receive an SMS is not a number this marketplace can save.
 */
export const AdminUpdateCustomerPhone = z.object({
  phone: iranMobileField(),
})
