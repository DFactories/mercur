import {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaResponse,
} from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { IRbacModuleService } from "@medusajs/types"
import { SellerRole } from "@mercurjs/types"
import { ensureSellerDefaultRoles } from "../../modules/seller/utils/ensure-seller-default-roles"
import { SellerContext } from "../../types/seller-context"

const SELLER_ID_HEADER = "x-seller-id"

export async function ensureSellerMiddleware(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  let sellerId = req.get(SELLER_ID_HEADER) || req.session?.seller_id

  if (!sellerId) {
    return next(
      new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `${SELLER_ID_HEADER} header is required for vendor routes`
      )
    )
  }

  const memberId = req.auth_context.actor_id
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: sellerMembers } = await query.graph(
    {
      entity: "seller_member",
      fields: ["id", "seller_id", "member_id", "role_id", "seller.*"],
      filters: {
        seller_id: sellerId,
        member_id: memberId,
      },
    },
    { cache: { enable: true } }
  )

  if (!sellerMembers.length) {
    return next(
      new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "You are not a member of this seller account"
      )
    )
  }

  const sellerMember = sellerMembers[0]

  req.seller_context = {
    seller_id: sellerId,
    seller_member: sellerMember,
    currency_code: sellerMember.seller.currency_code,
  } as SellerContext

  /**
   * The owner is the account, so the owner is never role-restricted.
   *
   * `is_owner` was not consulted here at all, while everything else in the
   * codebase treats it as a bypass: `validate-not-owner` refuses to change an
   * owner's role, `validate-remove-seller-member` refuses to remove their seat,
   * and the readiness lib's `memberCanPerform` opens with
   * `if (member.is_owner) return true`. Only the RBAC policy check disagreed.
   *
   * That disagreement locks an owner out of their own store. Ownership and role
   * are assigned independently — `acceptInvitesByPhone` and
   * `acceptMemberInviteWorkflow` both write `is_owner: owners.length === 0`
   * alongside `role_id: invite.role_id` — so the first person invited to a
   * store that has no owner yet becomes the owner carrying whatever role the
   * invite named. Invite them as anything but Seller Administration and they
   * own a store whose settings they cannot open, with no way back: their role
   * cannot be changed, because they are the owner.
   *
   * That is exactly the shape of an admin-created store handed over later, and
   * it stayed survivable only because `POST /vendor/sellers/me` was unguarded
   * and the panel calls `/me`. Closing that hole would have turned a latent
   * inconsistency into a lockout.
   */
  const effectiveRole = sellerMember.is_owner
    ? SellerRole.SELLER_ADMINISTRATION
    : sellerMember.role_id

  if (effectiveRole) {
    const rbacService: IRbacModuleService = req.scope.resolve(Modules.RBAC)

    await ensureSellerDefaultRoles(rbacService)

    req.auth_context.app_metadata = {
      ...req.auth_context.app_metadata,
      roles: [effectiveRole],
    }
  }

  next()
}
