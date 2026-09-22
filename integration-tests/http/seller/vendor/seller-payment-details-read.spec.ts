import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { SellerRole } from "@mercurjs/types"
import jwt from "jsonwebtoken"

import { createSellerUser } from "../../../helpers/create-seller-user"

jest.setTimeout(120000)

/**
 * A store's bank details belong to the people who run it, not to everybody on
 * the team.
 *
 * `retrieveVendorSellerQueryConfig` selects `*payment_details` and
 * `retrieveVendorMemberMeQueryConfig` selects `seller.payment_details.*`, so
 * every member of a store read its IBAN whatever their seller role — Support,
 * Inventory Management, and the assisted-onboarding operator whose whole
 * definition is that money is not their business. The write route has declared
 * `seller_payment_details:update` since the resource was split out; only the
 * read side was left open.
 */
const IBAN = "IR820540102680020817909002"

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    describe("Vendor - reading a store's payment details", () => {
      let appContainer: MedusaContainer
      let sellerId: string
      let ownerHeaders: { headers: Record<string, string> }

      /** A second member of the same store, holding `role`. */
      const teammate = async (email: string, role: string | null) => {
        const sellerModule: any = appContainer.resolve("seller")
        const member = await sellerModule.createMembers({
          name: email,
          email,
        })
        const memberId = Array.isArray(member) ? member[0].id : member.id

        await sellerModule.createSellerMembers({
          seller_id: sellerId,
          member_id: memberId,
          email,
          name: email,
          role_id: role,
          is_owner: false,
        })

        const config = appContainer.resolve(
          ContainerRegistrationKeys.CONFIG_MODULE
        )
        const { jwtSecret, jwtOptions } = config.projectConfig.http
        const token = jwt.sign(
          {
            actor_id: memberId,
            actor_type: "member",
            auth_identity_id: `test_ai_${memberId}`,
          },
          jwtSecret as string,
          { expiresIn: "1d", ...(jwtOptions ?? {}) }
        )

        return {
          headers: {
            authorization: `Bearer ${token}`,
            "x-seller-id": sellerId,
          },
        }
      }

      beforeEach(async () => {
        appContainer = getContainer()

        const created = await createSellerUser(appContainer, {
          email: "owner@test.com",
          name: "Owner Store",
        })
        sellerId = (created.seller as { id: string }).id
        ownerHeaders = created.headers as { headers: Record<string, string> }

        const sellerModule: any = appContainer.resolve("seller")
        await sellerModule.createPaymentDetails({
          seller_id: sellerId,
          holder_name: "The Producer",
          iban: IBAN,
          account_number: "0201234567001",
        })
      })

      it("gives them to the owner", async () => {
        // The owner is the account. `ensureSellerMiddleware` maps them to
        // Seller Administration whatever their own role says, and without this
        // passing, every assertion below would be satisfied by a route that
        // hides the details from everyone.
        const res = await api.get("/vendor/sellers/me", ownerHeaders)

        expect(res.status).toBe(200)
        expect(res.data.seller.payment_details?.iban).toBe(IBAN)
      })

      it.each([
        ["support", SellerRole.SUPPORT],
        ["inventory management", SellerRole.INVENTORY_MANAGEMENT],
        ["order management", SellerRole.ORDER_MANAGEMENT],
        ["the assisted onboarding operator", SellerRole.ASSISTED_OPERATOR],
      ])("withholds them from %s", async (label, role) => {
        const member = await teammate(`${label.replace(/\s/g, "-")}@test.com`, role)

        const res = await api.get("/vendor/sellers/me", member)

        expect(res.status).toBe(200)
        expect(res.data.seller.id).toBe(sellerId)
        expect(res.data.seller.payment_details).toBeFalsy()
      })

      it("withholds them from the member's own profile route", async () => {
        // `GET /vendor/members/me` asks for `seller.payment_details.*`
        // explicitly — a nested path, which is why the guard matches by path
        // segment rather than by prefix.
        const member = await teammate("nested@test.com", SellerRole.SUPPORT)

        const res = await api.get("/vendor/members/me", member)

        expect(res.status).toBe(200)
        expect(res.data.seller_member.seller?.payment_details).toBeFalsy()
      })

      it("withholds them when they are asked for by name", async () => {
        const member = await teammate("asker@test.com", SellerRole.SUPPORT)

        const res = await api.get(
          "/vendor/sellers/me?fields=%2Bpayment_details.iban",
          member
        )

        expect(res.status).toBe(200)
        expect(res.data.seller.payment_details).toBeFalsy()
      })

      it("gives them to Accounting, which is the role for reading them", async () => {
        const accountant = await teammate("books@test.com", SellerRole.ACCOUNTING)

        const res = await api.get("/vendor/sellers/me", accountant)

        expect(res.status).toBe(200)
        expect(res.data.seller.payment_details?.iban).toBe(IBAN)
      })

      it("gives them to Seller Administration", async () => {
        const admin = await teammate(
          "administration@test.com",
          SellerRole.SELLER_ADMINISTRATION
        )

        const res = await api.get("/vendor/sellers/me", admin)

        expect(res.status).toBe(200)
        expect(res.data.seller.payment_details?.iban).toBe(IBAN)
      })

      describe("changing them", () => {
        const NEW_IBAN = "IR062960000000100324200001"

        /** axios rejects non-2xx, so read the status off the error instead. */
        const write = async (
          headers: { headers: Record<string, string> },
          iban: string
        ) => {
          try {
            const res = await api.post(
              `/vendor/sellers/${sellerId}/payment-details`,
              { holder_name: "The Producer", iban, account_number: "1" },
              headers
            )
            return res.status
          } catch (e: unknown) {
            const err = e as { response?: { status?: number } }
            if (!err.response?.status) throw e
            return err.response.status
          }
        }

        it("lets Accounting change them", async () => {
          // `POST /vendor/sellers/:id/payment-details` is the only route
          // `seller_payment_details:update` reaches, which is what makes this
          // grant something a store can hand out without also handing out
          // Seller Administration.
          const accountant = await teammate(
            "books-write@test.com",
            SellerRole.ACCOUNTING
          )

          await expect(write(accountant, NEW_IBAN)).resolves.toBe(200)

          const res = await api.get("/vendor/sellers/me", accountant)
          expect(res.data.seller.payment_details?.iban).toBe(NEW_IBAN)
        })

        it.each([
          ["support", SellerRole.SUPPORT],
          ["inventory management", SellerRole.INVENTORY_MANAGEMENT],
          ["order management", SellerRole.ORDER_MANAGEMENT],
          ["the assisted onboarding operator", SellerRole.ASSISTED_OPERATOR],
        ])("refuses %s", async (label, role) => {
          const member = await teammate(
            `${label.replace(/\s/g, "-")}-write@test.com`,
            role
          )

          await expect(write(member, NEW_IBAN)).resolves.toBe(403)
        })

        it("lets the owner change them", async () => {
          await expect(write(ownerHeaders, NEW_IBAN)).resolves.toBe(200)
        })
      })
    })
  },
})
