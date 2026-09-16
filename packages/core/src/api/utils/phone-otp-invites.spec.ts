import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../providers/smsir/client", () => ({
  createSmsIrClient: () => ({ sendVerify: vi.fn() }),
}))

import { createVerifyOtpHandler } from "./phone-otp"

/**
 * A pending invite is accepted when its phone signs in — for everyone.
 *
 * Phone invites have no usable link: the SMS carries no token, and the token
 * route lands on a page that asks for an email and a password this marketplace
 * does not issue. OTP sign-in IS the acceptance mechanism, which is the right
 * shape — nothing sensitive travels by SMS, and a forwarded message cannot
 * grant a seat.
 *
 * It only worked for one kind of recipient. Acceptance sat in the `else` of
 * "does this phone already have a member?", inside a branch that itself ran
 * only while the auth identity had no `member_id`. So an invite was honoured
 * for a phone with no member that had also never signed in, and for nobody
 * else: a producer invited to a second store, a colleague who already sells
 * somewhere, an operator taking a seat on a store they are setting up — all
 * got the SMS, signed in, and landed exactly where they started while the
 * invite quietly expired.
 *
 * Both of those are the COMMON cases, which is why "phone invites work" and
 * "phone invites are dead" were both reported at different times and both were
 * half right.
 */

const PHONE = "09121234567"

type Seat = { seller_id: string; member_id: string; role_id: string }

const setup = (opts: {
  /** A member already exists for this phone. */
  memberExists: boolean
  /** The auth identity is already linked to a member. */
  alreadyLinked: boolean
}) => {
  const seats: Seat[] = []
  const acceptedInvites: string[] = []

  const seller = {
    listMembers: vi.fn(async () =>
      opts.memberExists ? [{ id: "mem_existing", phone: PHONE }] : []
    ),
    createMembers: vi.fn(async () => [{ id: "mem_new" }]),
    listMemberInvites: vi.fn(async () => [
      {
        id: "meminv_1",
        seller_id: "sel_1",
        role_id: "role_seller_inventory_management",
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      },
    ]),
    updateMemberInvites: vi.fn(async ({ id }: { id: string }) => {
      acceptedInvites.push(id)
    }),
    listSellerMembers: vi.fn(async (f: { seller_id: string; member_id?: string }) =>
      seats.filter(
        (s) => s.seller_id === f.seller_id && s.member_id === f.member_id
      )
    ),
    createSellerMembers: vi.fn(async (rows: Seat[]) => {
      seats.push(...rows)
    }),
  }

  const authIdentity = {
    id: "authid_1",
    app_metadata: opts.alreadyLinked ? { member_id: "mem_existing" } : {},
    provider_identities: [],
  }

  const authModule = {
    listProviderIdentities: vi.fn(async () => [
      { auth_identity_id: authIdentity.id },
    ]),
    retrieveAuthIdentity: vi.fn(async () => authIdentity),
    createAuthIdentities: vi.fn(async () => authIdentity),
    updateAuthIdentities: vi.fn(async () => authIdentity),
  }

  const otp = { verifyOtp: vi.fn(async () => undefined) }

  const configModule = {
    projectConfig: { http: { jwtSecret: "secret", jwtExpiresIn: "1d" } },
  }

  const scope = {
    resolve: (key: string) => {
      if (key === "otp") return otp
      if (key === "seller") return seller
      if (key === "auth") return authModule
      if (key === "configModule") return configModule
      throw new Error(`unexpected resolve(${key})`)
    },
  }

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }

  return {
    seats,
    acceptedInvites,
    seller,
    run: () =>
      createVerifyOtpHandler("member")(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { body: { phone: PHONE, code: "12345" }, scope } as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        res as any
      ),
  }
}

describe("OTP sign-in accepts pending invites", () => {
  beforeEach(() => vi.clearAllMocks())

  it("for a phone that has never had an account", async () => {
    // The one case that always worked. Kept so a fix to the others cannot
    // regress it.
    const { run, seats, acceptedInvites } = setup({
      memberExists: false,
      alreadyLinked: false,
    })
    await run()

    expect(seats).toHaveLength(1)
    expect(seats[0].seller_id).toBe("sel_1")
    expect(acceptedInvites).toEqual(["meminv_1"])
  })

  it("for a phone that already has a member account", async () => {
    // A colleague who already sells somewhere, or the operator taking a seat
    // on a store they are setting up. The seat must go to their EXISTING
    // member, not to a second one.
    const { run, seats, acceptedInvites, seller } = setup({
      memberExists: true,
      alreadyLinked: false,
    })
    await run()

    expect(seats).toHaveLength(1)
    expect(seats[0].member_id).toBe("mem_existing")
    expect(seller.createMembers).not.toHaveBeenCalled()
    expect(acceptedInvites).toEqual(["meminv_1"])
  })

  it("for a member who has signed in before", async () => {
    // A returning vendor invited to a second store. The whole branch used to
    // be skipped once `app_metadata.member_id` was set, so this invite could
    // never be accepted by any route.
    const { run, seats, acceptedInvites } = setup({
      memberExists: true,
      alreadyLinked: true,
    })
    await run()

    expect(seats).toHaveLength(1)
    expect(acceptedInvites).toEqual(["meminv_1"])
  })
})
