export const adminSellerFields = [
  "id",
  "name",
  "handle",
  "email",
  "phone",
  // Whether the store phone has passed its SMS check. The operator panel shows
  // it beside the number, and an operator editing the number clears it — so the
  // badge has to be readable from here or the reset is invisible.
  "phone_verified_at",
  "description",
  "logo",
  "banner",
  "website_url",
  "external_id",
  "currency_code",
  "status",
  "status_reason",
  "approved_at",
  "rejected_at",
  "is_premium",
  "closed_from",
  "closed_to",
  "closure_note",
  "*address",
  "*payment_details",
  "*professional_details",
  "metadata",
  "created_at",
  "updated_at",
  "payout_account.id",
  "payout_account.status",
  "payout_account.data",
  "payout_account.created_at",
  "payout_account.onboarding.id",
  "payout_account.onboarding.data",
]

export const adminSellerRetrieveFields = [
  ...adminSellerFields,
  "*members",
]

export const adminSellerQueryConfig = {
  list: {
    defaults: adminSellerFields,
    defaultLimit: 50,
    isList: true,
  },
  retrieve: {
    defaults: adminSellerRetrieveFields,
    isList: false,
  },
}

export const adminMembersQueryConfig = {
  list: {
    defaults: [
      "id",
      // The FK scalar, not just the expanded `member.*` object. `query.graph`
      // returns a relation's id only where it is asked for, so a caller that
      // reads `seller_member.member_id` — the admin team form's "is this person
      // already on the team?" guard does exactly that — got `undefined` for
      // every row and concluded the store had no members at all. That turns the
      // duplicate check into a no-op and lets a re-add reach the
      // `(seller_id, member_id)` unique index as a raw database error.
      "member_id",
      "is_owner",
      "role_id",
      "member.*",
      "created_at",
      "rbac_role.*",
    ],
    defaultLimit: 50,
    isList: true,
  },
}

export const adminMemberInvitesQueryConfig = {
  list: {
    defaults: [
      "id",
      "email",
      "phone",
      "accepted",
      "role_id",
      "token",
      "expires_at",
      "created_at",
      "updated_at",
    ],
    defaultLimit: 50,
    isList: true,
  },
}

export const adminSellerProductsQueryConfig = {
  list: {
    defaults: [
      "id",
      "title",
      "handle",
      "status",
      "thumbnail",
      "*collection",
      "*sales_channels",
      "variants.id",
      "created_at",
      "updated_at",
    ],
    defaultLimit: 50,
    isList: true,
  },
}
