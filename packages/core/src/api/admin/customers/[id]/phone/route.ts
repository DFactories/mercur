import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ICustomerModuleService } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"

import { AdminUpdateCustomerPhoneType } from "../../validators"
import { iranMobileVariants } from "../../../../utils/phone"
import {
  assertPhoneNotClaimedElsewhere,
  repointPhoneLoginIdentity,
} from "../../../../utils/phone-login-identity"

/**
 * POST /admin/customers/:id/phone — change a shopper's number from the operator
 * panel.
 *
 * Its own route rather than a field on the customer update, because the phone
 * is the sign-in credential here: it has to move together with the phone-OTP
 * login identity, and it has to be refused when it already opens someone else's
 * account. See `utils/phone-login-identity`.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<AdminUpdateCustomerPhoneType>,
  res: MedusaResponse
) => {
  const { phone } = req.validatedBody
  const customerId = req.params.id

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const customerService = req.scope.resolve<ICustomerModuleService>(
    Modules.CUSTOMER
  )

  const {
    data: [customer],
  } = await query.graph({
    entity: "customer",
    fields: ["id", "phone"],
    filters: { id: customerId },
  })

  if (!customer) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Customer with id ${customerId} was not found`
    )
  }

  // Taken by another shopper? Check the stored number as well as the login
  // identity — either one means the number already reaches someone's account.
  const { data: holders } = await query.graph({
    entity: "customer",
    fields: ["id"],
    filters: { phone: iranMobileVariants(phone) },
  })
  if ((holders ?? []).some((c: { id: string }) => c.id !== customerId)) {
    throw new MedusaError(
      MedusaError.Types.DUPLICATE_ERROR,
      "PHONE_ALREADY_REGISTERED"
    )
  }

  await assertPhoneNotClaimedElsewhere(req.scope, phone, {
    key: "customer_id",
    id: customerId,
  })

  await customerService.updateCustomers(customerId, { phone })

  const moved = await repointPhoneLoginIdentity(req.scope, {
    owner: { key: "customer_id", id: customerId },
    old_phone: (customer.phone as string | null) ?? null,
    new_phone: phone,
  })

  const {
    data: [updated],
  } = await query.graph({
    entity: "customer",
    fields: ["id", "email", "phone", "first_name", "last_name"],
    filters: { id: customerId },
  })

  res.json({
    customer: updated,
    // Honest about what actually moved: a shopper who never had a phone login
    // does not get one from an operator typing a number here.
    login_identity_updated: moved > 0,
  })
}
