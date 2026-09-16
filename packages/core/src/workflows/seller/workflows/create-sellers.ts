import {
  createHook,
  createWorkflow,
  transform,
  WorkflowResponse,
  type Hook,
  type ReturnWorkflow,
} from "@medusajs/framework/workflows-sdk"
import { emitEventStep } from "@medusajs/medusa/core-flows"
import {
  CreateSellerDTO,
  SellerDTO,
  SellerRole,
  SellerStatus,
} from "@mercurjs/types"
import { AdditionalData } from "@medusajs/framework/types"

import { createSellersStep } from "../steps"
import { SellerWorkflowEvents } from "../../events"
import { createMemberInvitesWorkflow } from "./create-member-invites"

export const createSellersWorkflowId = "create-sellers"

export type CreateSellersWorkflowInput = {
  sellers: (CreateSellerDTO & {
    /** Who the initial Seller Administration invite goes to. One of the two. */
    member: { email?: string | null; phone?: string | null }
  })[]
} & AdditionalData

export type CreateSellersWorkflowHooks = [
  Hook<"validate", { input: CreateSellersWorkflowInput }, unknown>,
  Hook<
    "sellersCreated",
    {
      sellers: SellerDTO[]
      additional_data: Record<string, unknown> | undefined
    },
    unknown
  >,
]

export const createSellersWorkflow: ReturnWorkflow<
  CreateSellersWorkflowInput,
  SellerDTO[],
  CreateSellersWorkflowHooks
> = createWorkflow(
  createSellersWorkflowId,
  function (input: CreateSellersWorkflowInput) {
    const validate = createHook("validate", {
      input,
    })

    const sellers = createSellersStep(
      transform(input, ({ sellers }) =>
        sellers.map(({ member: _member, ...seller }) => ({
          ...seller,
          status: seller.status ?? SellerStatus.PENDING_APPROVAL,
        }))
      )
    )

    createMemberInvitesWorkflow.runAsStep({
      input: transform(
        { sellers, input },
        ({ sellers, input }) =>
          sellers.map((seller, i) => ({
            seller_id: seller.id,
            // Both travel. A phone invite is delivered by SMS and accepted on
            // OTP sign-in; an email-only one keeps the upstream behaviour.
            // Dropping the phone here is what made the admin create-store form
            // email-only in a marketplace nobody signs into with an email.
            email: input.sellers[i].member.email ?? null,
            phone: input.sellers[i].member.phone ?? null,
            role_id: SellerRole.SELLER_ADMINISTRATION,
          }))
      )
    })

    const sellersCreated = createHook("sellersCreated", {
      sellers,
      additional_data: input.additional_data,
    })

    const eventData = transform({ sellers }, ({ sellers }) =>
      sellers.map((s) => ({ id: s.id }))
    )

    emitEventStep({
      eventName: SellerWorkflowEvents.CREATED,
      data: eventData,
    })

    return new WorkflowResponse(sellers, { hooks: [validate, sellersCreated] })
  }
)
