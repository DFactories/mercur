import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { MercurModules, SellerRole } from "@mercurjs/types"

import {
  adminHeaders,
  createAdminUser,
} from "../../helpers/create-admin-user"
import { createSellerUser } from "../../helpers/create-seller-user"

/**
 * REGRESSION — a resent phone invite was addressed to nobody.
 *
 * Every invite form sends a phone and no email. `resendMemberInviteWorkflow`
 * deletes the invite and creates a fresh one, but carried only the EMAIL
 * across, so the replacement had neither: no SMS could go out, OTP sign-in
 * (which accepts a phone's pending invites) could never match it, and it sat
 * "pending" for good. The admin panel's "copy invite link" goes through the
 * same resend whenever the row has no token, so it did the same damage.
 *
 * Found while tracing a production report (2026-10-04) of an operator whose
 * seat "stayed pending even after signing up".
 */

jest.setTimeout(120000)

type OtpService = {
  requestOtp: (input: {
    identifier: string
    actor_type: string
  }) => Promise<{ code: string }>
}

const PHONE = "09125550101"

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("Admin - resending a phone invite", () => {
      let container: MedusaContainer
      let sellerId: string

      const invitesOf = async () =>
        (
          await api.get(`/admin/sellers/${sellerId}/members/invites`, adminHeaders)
        ).data.member_invites as {
          id: string
          phone: string | null
          email: string | null
          expires_at: string
        }[]

      beforeEach(async () => {
        container = getContainer()
        await createAdminUser(dbConnection, adminHeaders, container)
        const { seller } = await createSellerUser(container, {
          email: "resend-owner@test.com",
          name: "Resend Store",
        })
        sellerId = (seller as { id: string }).id
      })

      it("keeps the phone, so signing in with it still takes the seat", async () => {
        const invited = await api.post(
          `/admin/sellers/${sellerId}/members/invite`,
          { phone: PHONE, role_id: SellerRole.ASSISTED_OPERATOR },
          adminHeaders
        )
        expect(invited.status).toEqual(201)

        const resent = await api.post(
          `/admin/sellers/${sellerId}/members/invites/${invited.data.member_invite.id}/resend`,
          {},
          adminHeaders
        )
        expect(resent.status).toBeLessThan(300)

        const invites = await invitesOf()
        expect(invites).toHaveLength(1)
        expect(invites[0].id).not.toEqual(invited.data.member_invite.id)
        expect(invites[0].phone).toEqual(PHONE)

        const otp = container.resolve(MercurModules.OTP) as unknown as OtpService
        const { code } = await otp.requestOtp({
          identifier: PHONE,
          actor_type: "member",
        })
        const verified = await api.post("/vendor/auth/phone/verify-otp", {
          phone: PHONE,
          code,
        })
        expect(verified.status).toEqual(200)

        const members = await api.get(
          `/admin/sellers/${sellerId}/members?fields=*member`,
          adminHeaders
        )
        const seat = (
          members.data.seller_members as {
            role_id: string
            member: { phone: string | null }
          }[]
        ).find((m) => m.member?.phone === PHONE)
        expect(seat?.role_id).toEqual(SellerRole.ASSISTED_OPERATOR)
      })

      it("gives a lapsed invite a fresh expiry", async () => {
        const invited = await api.post(
          `/admin/sellers/${sellerId}/members/invite`,
          { phone: PHONE, role_id: SellerRole.ASSISTED_OPERATOR },
          adminHeaders
        )
        const seller = container.resolve(MercurModules.SELLER) as unknown as {
          updateMemberInvites: (data: { id: string; expires_at: Date }) => Promise<unknown>
        }
        await seller.updateMemberInvites({
          id: invited.data.member_invite.id,
          expires_at: new Date(Date.now() - 60_000),
        })

        await api.post(
          `/admin/sellers/${sellerId}/members/invites/${invited.data.member_invite.id}/resend`,
          {},
          adminHeaders
        )

        const [fresh] = await invitesOf()
        expect(fresh.phone).toEqual(PHONE)
        expect(new Date(fresh.expires_at).getTime()).toBeGreaterThan(Date.now())
      })
    })
  },
})
