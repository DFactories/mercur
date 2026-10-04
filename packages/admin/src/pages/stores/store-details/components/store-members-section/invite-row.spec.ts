import { describe, expect, it } from "vitest"

import { inviteContact, inviteState } from "./invite-row"

describe("inviteState", () => {
  const now = Date.parse("2026-10-04T12:00:00Z")

  it("is pending until it expires", () => {
    expect(inviteState("2026-10-05T12:00:00Z", now)).toEqual("pending")
  })

  it("is expired from the moment it lapses", () => {
    expect(inviteState("2026-10-04T12:00:00Z", now)).toEqual("expired")
    expect(inviteState(new Date("2026-09-27T15:06:23Z"), now)).toEqual("expired")
  })
})

describe("inviteContact", () => {
  it("names the phone a phone invite was sent to", () => {
    expect(inviteContact({ phone: "09121234567", email: null })).toEqual("09121234567")
  })

  it("falls back to the email, then to a dash", () => {
    expect(inviteContact({ phone: null, email: "a@b.c" })).toEqual("a@b.c")
    expect(inviteContact({})).toEqual("-")
  })
})
