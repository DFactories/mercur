import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  emitEventStep,
  setAuthAppMetadataStep,
} from "@medusajs/medusa/core-flows"

import {
  validateMemberInviteTokenStep,
  upsertMembersStep,
  createSellerMembersStep,
  deleteMemberInviteStep,
  createSellerDefaultRolesStep,
  checkSellerHasOwnerStep,
} from "../steps"
import { MemberInviteWorkflowEvents } from "../../events"

export const acceptMemberInviteWorkflowId = "accept-member-invite"

/**
 * The member record an accepted invite resolves to — BOTH identities carried
 * off the invite, not just the email.
 *
 * Phone is the primary invite identity: it is what `AdminInviteSellerMember`
 * requires and what an OTP sign-up has, so `email` is null for every phone
 * invite. Passing the email alone meant `upsertMembers` received no identity
 * at all — it matched nothing, created a member row with a null email AND a
 * null phone (the unique indexes are partial on `IS NOT NULL`, so nothing
 * stopped it), then could not find that row in its own by-email/by-phone maps
 * and returned `undefined`. The seat was written against `undefined`, the
 * accept blew up, and an unreachable orphan member was left behind.
 *
 * With the phone present, an invitee who already has an account is matched on
 * it and keeps that identity instead of gaining a second, disconnected one.
 *
 * Exported as a plain function so the rule is unit-testable: the defect was in
 * the shape of this object, and nothing about a workflow transform makes that
 * shape observable from the outside.
 */
export const inviteeMemberInput = (
  invite: { email?: string | null; phone?: string | null },
  input: { first_name?: string | null; last_name?: string | null }
) => ({
  email: invite.email ?? null,
  phone: invite.phone ?? null,
  first_name: input.first_name ?? null,
  last_name: input.last_name ?? null,
})

type AcceptMemberInviteWorkflowInput = {
  invite_token: string
  auth_identity_id: string
  member_id?: string
  first_name?: string
  last_name?: string
}

export const acceptMemberInviteWorkflow = createWorkflow(
  acceptMemberInviteWorkflowId,
  function (input: AcceptMemberInviteWorkflowInput) {
    createSellerDefaultRolesStep()

    const invite = validateMemberInviteTokenStep(input.invite_token)

    const members = upsertMembersStep(
      transform({ invite, input }, ({ invite, input }) => [
        inviteeMemberInput(invite, input),
      ])
    )

    const member = transform({ members }, ({ members }) => members[0])

    const ownerCheck = checkSellerHasOwnerStep(
      transform({ invite }, ({ invite }) => ({ seller_id: invite.seller_id }))
    )

    createSellerMembersStep(
      transform(
        { invite, member, ownerCheck },
        ({ invite, member, ownerCheck }) => [{
          seller_id: invite.seller_id,
          member_id: member.id,
          role_id: invite.role_id,
          is_owner: !ownerCheck.hasOwner,
        }]
      )
    )

    when('no-existing-member', input, ({ member_id }) => !member_id).then(() => {
      setAuthAppMetadataStep({
        authIdentityId: input.auth_identity_id,
        actorType: "member",
        value: member.id,
      })
    })

    deleteMemberInviteStep([invite.id])

    emitEventStep({
      eventName: MemberInviteWorkflowEvents.ACCEPTED,
      data: { seller_id: invite.seller_id, member_id: member.id },
    })

    return new WorkflowResponse(member)
  }
)
