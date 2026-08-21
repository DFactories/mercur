import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { emitEventStep } from "@medusajs/medusa/core-flows"

import { createMemberInvitesStep } from "../steps"
import { MemberInviteWorkflowEvents } from "../../events"

export const createMemberInvitesWorkflowId = "create-member-invites"

type CreateMemberInvitesWorkflowInput = {
  seller_id: string
  email?: string | null
  phone?: string | null
  role_id: string
}[]

export const createMemberInvitesWorkflow = createWorkflow(
  createMemberInvitesWorkflowId,
  function (input: CreateMemberInvitesWorkflowInput) {
    const invites = createMemberInvitesStep(input)

    // `member_invite.created` is also a notification catalog event, so the
    // notification orchestrator routes the invite through the pipeline (SMS for
    // phone invites). The resolver handles this array payload.
    emitEventStep({
      eventName: MemberInviteWorkflowEvents.CREATED,
      data: transform({ invites }, ({ invites }) =>
        invites.map((inv) => ({ id: inv.id, token: inv.token, expires_at: inv.expires_at }))
      ),
    })

    return new WorkflowResponse(invites)
  }
)
