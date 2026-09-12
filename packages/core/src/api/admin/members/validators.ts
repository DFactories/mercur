import { createFindParams } from "@medusajs/medusa/api/utils/validators"
import { z } from "zod"

import { iranMobileField } from "../../utils/phone"

export type AdminGetMembersParamsType = z.infer<typeof AdminGetMembersParams>
export const AdminGetMembersParams = createFindParams({
  limit: 10,
  offset: 0,
}).extend({
  q: z.string().optional(),
  email: z.string().optional(),
})

export type AdminUpdateMemberPhoneType = z.infer<typeof AdminUpdateMemberPhone>
/**
 * The member phone is the vendor panel's sign-in credential, so it is held to
 * the same rule as the sign-up form: a number that cannot receive an SMS is a
 * number nobody can sign in with.
 */
export const AdminUpdateMemberPhone = z.object({
  phone: iranMobileField(),
})
