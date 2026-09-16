/**
 * How a member is identified — in one place, because it was in three and they
 * disagreed.
 *
 * A member signs in with a PHONE (OTP sign-up, the default in this
 * marketplace) or with an EMAIL (email/password sign-up). Exactly one is
 * normally set, so every "have I seen this person before?" question has to ask
 * about both. Three call sites asked, and two of them asked about the email
 * alone:
 *
 *  - `upsertMembers` matched on both, correctly.
 *  - `createMemberInvites` matched on email only, so inviting a phone that
 *    already had a seat was never rejected, and the `existing_member` claim it
 *    stamps into the invite token was `false` for every phone invite — which
 *    sent a person who already had an account down the sign-up path.
 *  - `acceptMemberInviteWorkflow` passed only the email through to the upsert,
 *    so a phone invite arrived carrying NO identity at all: nothing matched, a
 *    member row with a null email and a null phone was created (the unique
 *    indexes are partial on `IS NOT NULL`, so the database allows any number
 *    of them), and the lookup that followed could not find the row it had just
 *    written.
 *
 * Keeping the rule in one tested module is the fix for the class, not just for
 * the three instances.
 */

/** Anything carrying the two identity columns — an invite, a member, a form. */
export type MemberIdentity = {
  email?: string | null
  phone?: string | null
}

/**
 * True when this record names someone.
 *
 * A record with neither column is not an anonymous member, it is an unusable
 * one: it can never be matched, never signed in to, and never invited again.
 */
export const hasMemberIdentity = (record: MemberIdentity): boolean =>
  !!record.email || !!record.phone

/**
 * Index existing members by each identity they hold.
 *
 * A member can hold both, and a list built by querying email and phone
 * separately contains such a member twice — so callers that need the members
 * themselves should read `unique`, not the input array.
 */
export const indexMembersByIdentity = <T extends MemberIdentity & { id: string }>(
  members: T[]
) => {
  const unique = [...new Map(members.map((m) => [m.id, m])).values()]

  return {
    unique,
    byEmail: new Map(
      unique.filter((m) => m.email).map((m) => [m.email as string, m])
    ),
    byPhone: new Map(
      unique.filter((m) => m.phone).map((m) => [m.phone as string, m])
    ),
  }
}

export type MemberIdentityIndex<T extends MemberIdentity & { id: string }> =
  ReturnType<typeof indexMembersByIdentity<T>>

/**
 * The existing member this record refers to, by either identity.
 *
 * Email is consulted first only because it is the older of the two columns;
 * the two never point at different people, since both are uniquely indexed.
 */
export const findMemberByIdentity = <T extends MemberIdentity & { id: string }>(
  index: MemberIdentityIndex<T>,
  record: MemberIdentity
): T | undefined =>
  (record.email ? index.byEmail.get(record.email) : undefined) ??
  (record.phone ? index.byPhone.get(record.phone) : undefined)

/** The identity to name in an error message — the one the caller addressed. */
export const describeMemberIdentity = (record: MemberIdentity): string =>
  record.phone ?? record.email ?? "(no identity)"
