import { describe, expect, it } from "vitest"

import { AdminCreateSeller } from "./validators"

/**
 * A store can be created for a phone, not only for an email.
 *
 * `POST /admin/sellers` creates the store and issues an invite but no seat, so
 * whoever accepts that invite becomes the owner. That makes `member` the
 * handover: it names the person the store is being created FOR.
 *
 * It accepted an email and nothing else, in a marketplace where vendors sign
 * in with an OTP and `member.email` is null for nearly all of them. An
 * operator creating a store for a real producer had to invent an address —
 * leaving an invite nobody can accept parked on the account — then send a
 * second invite by phone and cancel the first. Every step of that is a chance
 * to hand the store to the wrong person, because the first invite accepted
 * wins the ownership.
 */

const body = (member: Record<string, string>) => ({
  name: "کارگاه نمونه",
  email: "store@example.com",
  currency_code: "irr",
  member,
})

describe("POST /admin/sellers", () => {
  it("accepts a phone-only member", () => {
    // The case this marketplace actually has.
    const parsed = AdminCreateSeller().parse(body({ phone: "09121234567" }))
    expect(parsed.member.phone).toBe("09121234567")
  })

  it("still accepts an email-only member", () => {
    // Upstream email/password deployments must keep working.
    const parsed = AdminCreateSeller().parse(
      body({ email: "owner@example.com" })
    )
    expect(parsed.member.email).toBe("owner@example.com")
  })

  it("accepts both together", () => {
    const parsed = AdminCreateSeller().parse(
      body({ email: "owner@example.com", phone: "09121234567" })
    )
    expect(parsed.member.email).toBe("owner@example.com")
    expect(parsed.member.phone).toBe("09121234567")
  })

  it("refuses a member with neither", () => {
    // An invite addressed to nobody can never be accepted, so the store would
    // be created permanently ownerless with no way to hand it over.
    expect(() => AdminCreateSeller().parse(body({}))).toThrow()
  })

  it("refuses a number that cannot receive an OTP", () => {
    // A landline is an invite nobody can accept — the same rule the rest of
    // the seller routes hold phone fields to.
    expect(() =>
      AdminCreateSeller().parse(body({ phone: "02112345678" }))
    ).toThrow()
  })
})
