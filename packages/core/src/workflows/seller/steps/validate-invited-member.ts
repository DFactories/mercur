import { StepResponse, createStep } from "@medusajs/framework/workflows-sdk"
import { IAuthModuleService } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { MercurModules } from "@mercurjs/types"

import SellerModuleService from "../../../modules/seller/service"
import {
  iranMobileVariants,
  normalizeIranPhone,
  PHONE_OTP_PROVIDER,
} from "../../../api/utils/phone"

type ValidateInvitedMemberStepInput = {
  email?: string | null
  phone?: string | null
  /** The caller's member, when their session already has one. */
  member_id?: string
  auth_identity_id: string
}

/**
 * Who may become the member an email or a phone names.
 *
 * `upsertMembers` returns the EXISTING member holding the email or phone it is
 * given, and both callers then wrote that member's id onto the caller's auth
 * identity. The value came from the request body (`POST /vendor/sellers`) or
 * from an invite anyone holding its link can present, so a fresh sign-up
 * became any member whose number or email it named, with every store that
 * member belongs to.
 *
 * Upstream closed the email half in v2.4.1 (#1739); phone is this fork's
 * sign-in identity, so it is covered here too:
 *  - a caller who already is a member may only be named as themself;
 *  - a caller who is not yet a member may not be attached to an existing one;
 *  - a new member's phone must be one the caller's session verified by OTP,
 *    because the next OTP sign-in on that number opens this member.
 */
export const validateInvitedMemberStep = createStep(
  "validate-invited-member",
  async (input: ValidateInvitedMemberStepInput, { container }) => {
    const service = container.resolve<SellerModuleService>(MercurModules.SELLER)

    const existing = [
      ...(input.email
        ? await service.listMembers(
            { email: input.email },
            { select: ["id"] }
          )
        : []),
      ...(input.phone
        ? await service.listMembers(
            { phone: iranMobileVariants(input.phone) },
            { select: ["id"] }
          )
        : []),
    ]

    if (input.member_id) {
      if (!existing.length || existing.some((m) => m.id !== input.member_id)) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "This invite was issued to a different member"
        )
      }
      return new StepResponse(void 0)
    }

    if (existing.length) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "A member with this email or phone already exists"
      )
    }

    if (input.phone) {
      const auth = container.resolve<IAuthModuleService>(Modules.AUTH)
      const proven = await auth.listProviderIdentities({
        auth_identity_id: input.auth_identity_id,
        provider: PHONE_OTP_PROVIDER,
      })
      const phone = normalizeIranPhone(input.phone)
      if (!proven.some((p) => normalizeIranPhone(p.entity_id) === phone)) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "A member's phone must be the number this session signed in with"
        )
      }
    }

    return new StepResponse(void 0)
  }
)
