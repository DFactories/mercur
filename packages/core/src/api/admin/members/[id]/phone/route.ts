import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { MercurModules } from "@mercurjs/types"

import { AdminUpdateMemberPhoneType } from "../../validators"
import { iranMobileVariants, normalizeIranPhone } from "../../../../utils/phone"
import {
  assertPhoneNotClaimedElsewhere,
  repointPhoneLoginIdentity,
} from "../../../../utils/phone-login-identity"

type MemberServiceLike = {
  updateMembers: (data: { id: string; phone: string }) => Promise<unknown>
}

/**
 * POST /admin/members/:id/phone — change a store member's SIGN-IN number.
 *
 * This is the one an operator needs when a producer is locked out: the member
 * phone is the vendor panel's credential (`seller.phone` is a separate, public
 * contact number for the store). A landline typed at registration used to be
 * accepted, and the account it created could never be opened again — this is
 * how those accounts are recovered.
 *
 * Not seller-scoped, because a member is not: one person can belong to several
 * stores and signs in to all of them with the same number.
 *
 * No notification event is registered for this, deliberately. The only channel
 * that could reach the person is SMS — they are typically locked out, so a
 * panel feed row is unreadable to them by definition — and there is no approved
 * sms.ir template for a credential change, so an `sms` channel here would be a
 * switch that writes nothing. The operator performing this is on the phone with
 * the producer while they do it. Register a template first if that ever stops
 * being true.
 */
export const POST = async (
  req: AuthenticatedMedusaRequest<AdminUpdateMemberPhoneType>,
  res: MedusaResponse
) => {
  const { phone } = req.validatedBody
  const memberId = req.params.id

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const {
    data: [member],
  } = await query.graph({
    entity: "member",
    fields: ["id", "phone", "email", "name"],
    filters: { id: memberId },
  })

  if (!member) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Member with id ${memberId} was not found`
    )
  }

  const oldPhone = (member.phone as string | null) ?? null
  if (oldPhone && normalizeIranPhone(oldPhone) === phone) {
    // Nothing to do, and saying so beats a silent no-op in the panel.
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "PHONE_UNCHANGED")
  }

  // Another member already signs in with it?
  const { data: holders } = await query.graph({
    entity: "member",
    fields: ["id"],
    filters: { phone: iranMobileVariants(phone) },
  })
  if ((holders ?? []).some((m: { id: string }) => m.id !== memberId)) {
    throw new MedusaError(
      MedusaError.Types.DUPLICATE_ERROR,
      "PHONE_ALREADY_REGISTERED"
    )
  }

  // Or a shopper — the two share one phone-OTP namespace, so a number that
  // opens a customer account cannot also become a member's credential.
  await assertPhoneNotClaimedElsewhere(req.scope, phone, {
    key: "member_id",
    id: memberId,
  })

  const sellerModule = req.scope.resolve<MemberServiceLike>(
    MercurModules.SELLER
  )
  await sellerModule.updateMembers({ id: memberId, phone })

  const moved = await repointPhoneLoginIdentity(req.scope, {
    owner: { key: "member_id", id: memberId },
    old_phone: oldPhone,
    new_phone: phone,
  })

  const {
    data: [updated],
  } = await query.graph({
    entity: "member",
    fields: ["id", "name", "email", "phone"],
    filters: { id: memberId },
  })

  res.json({
    member: updated,
    // False means the member had no phone sign-in to move (e.g. an account
    // created by email) — the number is saved, but it opens nothing yet.
    login_identity_updated: moved > 0,
  })
}
