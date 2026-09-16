export enum Entities {
  seller = "seller",
  seller_member = "seller_member",
}

export const listVendorSellersQueryConfig = {
  defaults: [
    "id",
    "seller.*",
    "rbac_role.*",
  ],
  defaultLimit: 50,
  isList: true,
}

export const retrieveVendorSellerQueryConfig = {
  defaults: [
    "id",
    "name",
    "handle",
    "email",
    "phone",
    "phone_verified_at",
    "description",
    "logo",
    "banner",
    "website_url",
    "external_id",
    "currency_code",
    "status",
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
  ],
}

export const listVendorMembersQueryConfig = {
  defaults: [
    "id",
    // `role_id` and `member_id` are the flat columns the team page actually
    // reads. `query.graph` returns a relation's id only where it is asked for,
    // and `rbac_role.*` is a different shape — so the store's own team table
    // resolved `row.original.role_id` to `undefined` and rendered "-" in the
    // Role column for every teammate. An owner could not see who on their team
    // held which role, which is the one question that table exists to answer.
    "member_id",
    "role_id",
    "is_owner",
    "member.*",
    "rbac_role.*",
    "created_at"
  ],
  defaultLimit: 50,
  isList: true,
}

export const retrieveVendorMemberQueryConfig = {
  defaults: [
    "id",
    "member_id",
    "role_id",
    "is_owner",
    "member.*",
    "rbac_role.*",
    "created_at"
  ],
}

export const listVendorMemberInvitesQueryConfig = {
  defaults: [
    "id",
    "email",
    "phone",
    "accepted",
    "role_id",
    "expires_at",
    "created_at",
  ],
  defaultLimit: 50,
  isList: true,
}
