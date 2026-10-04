import { describe, expect, it } from "vitest"

import { inviteView } from "./invite-view"

const now = Date.parse("2026-10-04T12:00:00Z")
const seconds = (iso: string) => Date.parse(iso) / 1000

const token = (overrides: Record<string, unknown> = {}) => ({
  id: "meminv_1",
  jti: "j",
  iat: seconds("2026-10-01T12:00:00Z"),
  exp: seconds("2026-10-08T12:00:00Z"),
  email: null,
  phone: "09121234567",
  ...overrides,
})

describe("inviteView", () => {
  it("sends a phone invite to the OTP form", () => {
    expect(inviteView(token(), now)).toEqual("phone")
  })

  it("keeps the email form for an email invite", () => {
    expect(inviteView(token({ phone: null, email: "a@b.c" }), now)).toEqual("email")
  })

  it("says a lapsed invite is expired before anyone signs in", () => {
    // The production case: issued 2026-09-20, lapsed 2026-09-27, opened 10-04.
    expect(
      inviteView(
        token({ iat: seconds("2026-09-20T15:06:23Z"), exp: seconds("2026-09-27T15:06:23Z") }),
        now
      )
    ).toEqual("expired")
  })

  it("rejects a token that is missing its claims", () => {
    expect(inviteView(null, now)).toEqual("invalid")
    expect(inviteView(token({ jti: undefined }), now)).toEqual("invalid")
  })
})
