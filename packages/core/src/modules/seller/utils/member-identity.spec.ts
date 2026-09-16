import { describe, expect, it } from "vitest"

import {
  describeMemberIdentity,
  findMemberByIdentity,
  hasMemberIdentity,
  indexMembersByIdentity,
} from "./member-identity"
import { inviteeMemberInput } from "../../../workflows/seller/workflows/accept-member-invite"

/**
 * The phone path through team membership.
 *
 * This marketplace signs vendors in with a phone and an OTP — `member.email`
 * is null for every one of them, and `AdminInviteSellerMember` requires a
 * phone and treats the email as optional. Three separate places nonetheless
 * asked "do I know this person?" by email alone, and each failed silently
 * rather than loudly:
 *
 *  - accepting a phone invite passed NO identity to the upsert, so it created
 *    a member with a null email and a null phone, then could not find the row
 *    it had just written;
 *  - inviting a phone that already held a seat was never rejected, and only
 *    blew up later on the `(seller_id, member_id)` unique index;
 *  - the `existing_member` claim baked into the invite token was `false` for
 *    every phone invite, sending someone who already had an account down the
 *    sign-up path to mint a second one.
 *
 * These tests pin the rule that fixes all three: an identity is an email OR a
 * phone, never an email alone.
 */

const member = (id: string, identity: { email?: string; phone?: string }) => ({
  id,
  email: identity.email ?? null,
  phone: identity.phone ?? null,
})

describe("hasMemberIdentity", () => {
  it("accepts a phone-only member — the default in this marketplace", () => {
    expect(hasMemberIdentity({ phone: "09121234567" })).toBe(true)
  })

  it("accepts an email-only member", () => {
    expect(hasMemberIdentity({ email: "sara@example.com" })).toBe(true)
  })

  it("rejects a record carrying neither", () => {
    // The unique indexes on `member` are partial (`WHERE … IS NOT NULL`), so
    // the database happily stores any number of these. Such a row cannot sign
    // in, cannot be matched and cannot be invited again — it is only ever
    // litter, which is why this is refused before anything is written.
    expect(hasMemberIdentity({})).toBe(false)
    expect(hasMemberIdentity({ email: null, phone: null })).toBe(false)
    expect(hasMemberIdentity({ email: "", phone: "" })).toBe(false)
  })
})

describe("findMemberByIdentity", () => {
  it("finds a member by phone when they have no email at all", () => {
    const index = indexMembersByIdentity([
      member("mem_otp", { phone: "09121234567" }),
    ])

    expect(findMemberByIdentity(index, { phone: "09121234567" })?.id).toBe(
      "mem_otp"
    )
  })

  it("finds a member by email", () => {
    const index = indexMembersByIdentity([
      member("mem_pw", { email: "sara@example.com" }),
    ])

    expect(
      findMemberByIdentity(index, { email: "sara@example.com" })?.id
    ).toBe("mem_pw")
  })

  it("matches on the phone when the record carries no email", () => {
    // The exact shape of a phone invite: `{ email: null, phone: "0912…" }`.
    // An email-first lookup that stops at `undefined` returns nobody here,
    // which is how a known member looked brand new.
    const index = indexMembersByIdentity([
      member("mem_otp", { phone: "09121234567" }),
    ])

    expect(
      findMemberByIdentity(index, { email: null, phone: "09121234567" })?.id
    ).toBe("mem_otp")
  })

  it("returns nobody for an identity it has never seen", () => {
    const index = indexMembersByIdentity([
      member("mem_otp", { phone: "09121234567" }),
    ])

    expect(findMemberByIdentity(index, { phone: "09339876543" })).toBeUndefined()
  })
})

describe("indexMembersByIdentity", () => {
  it("lists a member holding both identities exactly once", () => {
    // The lookup queries email and phone separately, so somebody with both
    // comes back twice. Left deduped, the caller would ask the seat query
    // about the same member repeatedly and could report one person as two.
    const both = member("mem_both", {
      email: "sara@example.com",
      phone: "09121234567",
    })

    const index = indexMembersByIdentity([both, both])

    expect(index.unique).toHaveLength(1)
    expect(index.byEmail.get("sara@example.com")?.id).toBe("mem_both")
    expect(index.byPhone.get("09121234567")?.id).toBe("mem_both")
  })
})

describe("describeMemberIdentity", () => {
  it("names the phone when that is how the person was addressed", () => {
    // A "these are already members: " error listing `undefined` because the
    // invite had no email is not an error message, it is a puzzle.
    expect(describeMemberIdentity({ email: null, phone: "09121234567" })).toBe(
      "09121234567"
    )
  })
})

describe("inviteeMemberInput", () => {
  it("carries the phone off a phone invite", () => {
    // The regression itself. Before the fix this produced
    // `{ email: null, first_name: …, last_name: … }` — no identity at all.
    expect(
      inviteeMemberInput(
        { email: null, phone: "09121234567" },
        { first_name: "Sara", last_name: "Ahmadi" }
      )
    ).toEqual({
      email: null,
      phone: "09121234567",
      first_name: "Sara",
      last_name: "Ahmadi",
    })
  })

  it("always produces something with an identity when the invite has one", () => {
    // Guards the class rather than the instance: whatever else this transform
    // grows, an invite that names someone must not arrive at the upsert
    // anonymous.
    for (const invite of [
      { email: null, phone: "09121234567" },
      { email: "sara@example.com", phone: null },
      { email: "sara@example.com", phone: "09121234567" },
    ]) {
      expect(hasMemberIdentity(inviteeMemberInput(invite, {}))).toBe(true)
    }
  })

  it("leaves names null rather than undefined when they were not given", () => {
    expect(inviteeMemberInput({ phone: "09121234567" }, {})).toEqual({
      email: null,
      phone: "09121234567",
      first_name: null,
      last_name: null,
    })
  })
})
