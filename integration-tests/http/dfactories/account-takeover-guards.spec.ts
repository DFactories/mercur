import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  IAuthModuleService,
  ICustomerModuleService,
  MedusaContainer,
} from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { MercurModules, SellerRole } from "@mercurjs/types"

import {
  adminHeaders,
  createAdminUser,
  generatePublishableKey,
  generateStoreHeaders,
} from "../../helpers/create-admin-user"
import { createSellerUser } from "../../helpers/create-seller-user"

/**
 * REGRESSION — four ways into somebody else's account, found by the 2026-11-20
 * audit (AUD-B1, AUD-S04, AUD-B7, AUD-B8). None needed more than a phone the
 * attacker owns and one the victim owns.
 *
 *  1. `POST /vendor/sellers` took `member_phone` / `member_email` from the body
 *     and signed the caller in as the member already holding it.
 *  2. Accepting a member invite did the same with the invite's phone or email,
 *     for whoever presented its token.
 *  3. The OTP attempt counter was read, compared and written back separately,
 *     so parallel guesses were all compared; and each new code reset the count.
 *  4. A shopper's first OTP sign-in adopted any customer row carrying their
 *     number, including one somebody else already signs in to.
 */
jest.setTimeout(120000)

type ApiError = { response: { status: number; data: { message?: string } } }

const failed = (promise: Promise<unknown>) =>
  promise.then(
    (res) => res as never,
    (error: ApiError) => error
  )

const claims = (token: string): { actor_id?: string; auth_identity_id: string } =>
  JSON.parse(Buffer.from(token.split(".")[1], "base64").toString())

type OtpService = {
  requestOtp: (input: {
    identifier: string
    actor_type: string
  }) => Promise<{ id: string; code: string }>
  verifyOtp: (input: {
    identifier: string
    actor_type: string
    code: string
  }) => Promise<boolean>
}

type SellerService = {
  createMembers: (
    data: Array<{ phone?: string | null; email?: string | null }>
  ) => Promise<Array<{ id: string }>>
  listMemberInvites: (
    filters: Record<string, unknown>
  ) => Promise<Array<{ id: string; token: string }>>
  listSellerMembers: (
    filters: Record<string, unknown>
  ) => Promise<Array<{ id: string }>>
}

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("Dfactories - an account opens only for whoever proved its identity", () => {
      let container: MedusaContainer
      let otp: OtpService
      let sellers: SellerService
      let auth: IAuthModuleService

      beforeEach(async () => {
        container = getContainer()
        otp = container.resolve(MercurModules.OTP) as unknown as OtpService
        sellers = container.resolve(
          MercurModules.SELLER
        ) as unknown as SellerService
        auth = container.resolve(Modules.AUTH)
      })

      /** Sign a phone in at the vendor panel, the way the panel does. */
      const vendorSignIn = async (phone: string) => {
        const { code } = await otp.requestOtp({
          identifier: phone,
          actor_type: "member",
        })
        const { token } = (
          await api.post("/vendor/auth/phone/verify-otp", { phone, code })
        ).data
        return { token, bearer: { headers: { authorization: `Bearer ${token}` } } }
      }

      const memberOf = async (authIdentityId: string) =>
        (await auth.retrieveAuthIdentity(authIdentityId)).app_metadata
          ?.member_id as string | undefined

      describe("POST /vendor/sellers", () => {
        const VICTIM = "09121110001"
        const ATTACKER = "09121110002"

        it("does not sign a newcomer in as the member whose phone they typed", async () => {
          const [victim] = await sellers.createMembers([{ phone: VICTIM }])
          const { token, bearer } = await vendorSignIn(ATTACKER)

          const error = (await failed(
            api.post(
              "/vendor/sellers",
              { name: "Takeover", currency_code: "usd", member_phone: VICTIM },
              bearer
            )
          )) as ApiError

          expect(error.response.status).toBeGreaterThanOrEqual(400)
          expect(await memberOf(claims(token).auth_identity_id)).not.toEqual(
            victim.id
          )
          expect(await memberOf(claims(token).auth_identity_id)).toBeUndefined()
        })

        it("does not sign a newcomer in as the member whose email they typed", async () => {
          await createSellerUser(container, {
            email: "victim-owner@test.com",
            name: "Victim Store",
          })
          const { token, bearer } = await vendorSignIn(ATTACKER)

          const error = (await failed(
            api.post(
              "/vendor/sellers",
              {
                name: "Takeover",
                currency_code: "usd",
                member_email: "victim-owner@test.com",
              },
              bearer
            )
          )) as ApiError

          expect(error.response.status).toEqual(409)
          expect(await memberOf(claims(token).auth_identity_id)).toBeUndefined()
        })

        it("does not let a newcomer reserve a number they never proved", async () => {
          // Nobody holds this number yet. The member row would, and the real
          // owner's first OTP sign-in would then open the attacker's member.
          const { token, bearer } = await vendorSignIn(ATTACKER)

          const error = (await failed(
            api.post(
              "/vendor/sellers",
              { name: "Squat", currency_code: "usd", member_phone: VICTIM },
              bearer
            )
          )) as ApiError

          expect(error.response.status).toEqual(400)
          expect(await memberOf(claims(token).auth_identity_id)).toBeUndefined()
        })

        it("still opens a store for the number that signed in", async () => {
          const { token, bearer } = await vendorSignIn(ATTACKER)

          const response = await api.post(
            "/vendor/sellers",
            { name: "Honest Store", currency_code: "usd", member_phone: ATTACKER },
            bearer
          )

          expect(response.status).toEqual(201)
          expect(await memberOf(claims(token).auth_identity_id)).toBeTruthy()
        })
      })

      describe("accepting a member invite", () => {
        const VICTIM = "09121110011"
        const ATTACKER = "09121110012"

        it("does not sign the token's holder in as the invited member", async () => {
          await createAdminUser(dbConnection, adminHeaders, container)
          const { seller } = await createSellerUser(container, {
            email: "inviter@test.com",
            name: "Inviting Store",
          })
          const [victim] = await sellers.createMembers([{ phone: VICTIM }])

          // The inviter reads the link off the admin API; the invitee need
          // never see it.
          const invited = await api.post(
            `/admin/sellers/${(seller as { id: string }).id}/members/invite`,
            { phone: VICTIM, role_id: SellerRole.ASSISTED_OPERATOR },
            adminHeaders
          )
          const [invite] = await sellers.listMemberInvites({
            id: invited.data.member_invite.id,
          })

          const { token, bearer } = await vendorSignIn(ATTACKER)
          const error = (await failed(
            api.post(
              "/vendor/members/invites/accept",
              { invite_token: invite.token },
              bearer
            )
          )) as ApiError

          expect(error.response.status).toBeGreaterThanOrEqual(400)
          expect(await memberOf(claims(token).auth_identity_id)).toBeUndefined()
          // And the seat was not written for the victim behind their back.
          expect(
            await sellers.listSellerMembers({
              seller_id: (seller as { id: string }).id,
              member_id: victim.id,
            })
          ).toHaveLength(0)
        })
      })

      describe("guessing a code", () => {
        const PHONE = "09121110021"

        it("compares at most five of any number of parallel guesses", async () => {
          const { code } = await otp.requestOtp({
            identifier: PHONE,
            actor_type: "member",
          })
          const wrong = code === "00000" ? "00001" : "00000"

          const outcomes = await Promise.all(
            Array.from({ length: 25 }, () =>
              failed(
                api.post("/vendor/auth/phone/verify-otp", {
                  phone: PHONE,
                  code: wrong,
                })
              ).then((e) => (e as ApiError).response.status)
            )
          )

          // 401 = the guess was compared and found wrong; 400 = refused unread.
          expect(outcomes.filter((status) => status === 401)).toHaveLength(5)
          expect(outcomes.filter((status) => status === 400)).toHaveLength(20)

          // The code is dead: even the right one no longer opens the account.
          const late = (await failed(
            api.post("/vendor/auth/phone/verify-otp", { phone: PHONE, code })
          )) as ApiError
          expect(late.response.status).toEqual(400)
        })

        it("locks the number once its codes have collected ten wrong guesses", async () => {
          const guessFive = async () => {
            const { code } = await otp.requestOtp({
              identifier: PHONE,
              actor_type: "member",
            })
            const wrong = code === "00000" ? "00001" : "00000"
            for (let i = 0; i < 5; i++) {
              await failed(
                otp.verifyOtp({
                  identifier: PHONE,
                  actor_type: "member",
                  code: wrong,
                })
              )
            }
          }

          await guessFive()
          // The resend cooldown, served. Only the clock is moved: the guesses
          // stay inside the hour they are counted over.
          await dbConnection.raw(
            `update otp_code set created_at = now() - interval '3 minutes' where identifier = ?`,
            [PHONE]
          )
          await guessFive()
          await dbConnection.raw(
            `update otp_code set created_at = now() - interval '3 minutes' where identifier = ?`,
            [PHONE]
          )

          const refused = (await failed(
            api.post("/vendor/auth/phone/request-otp", { phone: PHONE })
          )) as ApiError
          expect(refused.response.status).toEqual(400)
          expect(refused.response.data.message).toContain("Please wait")
        })
      })

      describe("a shopper's first sign-in", () => {
        const VICTIM = "09121110031"
        let storeHeaders: { headers: Record<string, string> }
        let customers: ICustomerModuleService

        beforeEach(async () => {
          const publishableKey = await generatePublishableKey(container)
          storeHeaders = generateStoreHeaders({ publishableKey })
          customers = container.resolve(Modules.CUSTOMER)
        })

        const storeSignIn = async (phone: string) => {
          const { code } = await otp.requestOtp({
            identifier: phone,
            actor_type: "customer",
          })
          const { token } = (
            await api.post(
              "/store/auth/phone/verify-otp",
              { phone, code },
              storeHeaders
            )
          ).data
          return claims(token).actor_id
        }

        it("does not land in a row somebody else already signs in to", async () => {
          // What `POST /store/customers` leaves behind for an emailpass
          // identity that typed the victim's number.
          const [squatter] = await customers.createCustomers([
            { email: "squatter@test.com", phone: VICTIM, has_account: true },
          ])
          await auth.createAuthIdentities({
            provider_identities: [
              { provider: "emailpass", entity_id: "squatter@test.com" },
            ],
            app_metadata: { customer_id: squatter.id },
          })

          const signedInAs = await storeSignIn(VICTIM)

          expect(signedInAs).toBeTruthy()
          expect(signedInAs).not.toEqual(squatter.id)
        })

        it("still opens the row an operator or a guest checkout left for the number", async () => {
          const [guest] = await customers.createCustomers([
            { phone: VICTIM, has_account: false },
          ])

          expect(await storeSignIn(VICTIM)).toEqual(guest.id)
        })
      })
    })
  },
})
