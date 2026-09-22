import {
  authenticate,
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework"
import { MiddlewareRoute } from "@medusajs/medusa"

import { withHiddenPaymentDetails } from "../../utils/hide-seller-payment-details"

import { VendorGetSellerParams } from "../sellers/validators"
import { VendorAcceptMemberInvite, VendorUpdateMember } from "./validators"

const retrieveVendorMemberMeQueryConfig = {
  defaults: [
    "id",
    // Same flat columns as the team list configs in ../sellers/query-config.ts.
    // Kept in step deliberately: the seller-closure predicate lived in two
    // files and drifted, and a "me" shape that quietly omits the caller's own
    // role is the same trap waiting for the next consumer.
    "member_id",
    "role_id",
    "is_owner",
    "member.*",
    "rbac_role.*",
    "seller.*",
    "seller.address.*",
    "seller.payment_details.*",
    "seller.professional_details.*",
  ],
}

export const vendorMembersMiddlewares: MiddlewareRoute[] =
  withHiddenPaymentDetails([
  {
    method: ["POST"],
    matcher: "/vendor/members/invites/accept",
    middlewares: [
      authenticate("member", ["session", "bearer"], {
        allowUnregistered: true,
      }),
      validateAndTransformBody(VendorAcceptMemberInvite),
    ],
  },
  {
    method: ["GET"],
    matcher: "/vendor/members/me",
    middlewares: [
      validateAndTransformQuery(
        VendorGetSellerParams,
        retrieveVendorMemberMeQueryConfig
      ),
    ],
  },
  {
    method: ["POST"],
    matcher: "/vendor/members/me",
    middlewares: [
      validateAndTransformBody(VendorUpdateMember),
      validateAndTransformQuery(
        VendorGetSellerParams,
        retrieveVendorMemberMeQueryConfig
      ),
    ],
  },
  ])
