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
 * REGRESSION — a number nobody can sign in with must never be accepted, and the
 * shopper's number must never drift away from their login.
 *
 * Reported 2026-09: a producer registered with a landline. Nothing refused it —
 * the sign-up form, the store phone in onboarding, the store phone in settings
 * and both member invites all took any string — so the account was created and
 * the OTP was sent to a phone that cannot receive SMS. The account existed and
 * could never be opened, and support could not fix it either: the operator
 * panel's store and customer drawers demanded an email, which a phone-registered
 * account does not have, so the phone field right below it could never be saved.
 *
 * Three things are proven here, at the only level that survives a panel rewrite:
 *  1. every write of a sign-in number refuses a landline, in Persian digits too;
 *  2. an operator can correct a store's phone with no email on the record, and
 *     the store's SMS verification does not survive the change;
 *  3. an operator changing a shopper's number moves the sign-in identity with
 *     it — otherwise the old number keeps the account and the new one opens
 *     nothing.
 */
jest.setTimeout(120000)

type ApiError = { response: { status: number; data: { message?: string } } }

const LANDLINE = "02112345678"
const PERSIAN_MOBILE = "۰۹۱۲۹۹۹۸۸۷۷"
const PERSIAN_MOBILE_LATIN = "09129998877"

const failed = (promise: Promise<unknown>) =>
  promise.then(
    (res) => res as never,
    (error: ApiError) => error
  )

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("Dfactories - the phone is a credential, not free text", () => {
      let container: MedusaContainer
      let seller: { id: string }
      let vendorHeaders: { headers: Record<string, string> }
      let storeHeaders: { headers: Record<string, string> }

      beforeEach(async () => {
        container = getContainer()
        await createAdminUser(dbConnection, adminHeaders, container)

        const created = await createSellerUser(container, {
          email: "phone-guard@test.com",
          name: "Phone Guard Store",
        })
        seller = created.seller as { id: string }
        vendorHeaders = created.headers

        const publishableKey = await generatePublishableKey(container)
        storeHeaders = generateStoreHeaders({ publishableKey })
      })

      describe("a landline never becomes an account", () => {
        it("refuses a landline at vendor sign-in, before an SMS is spent", async () => {
          const error = (await failed(
            api.post("/vendor/auth/phone/request-otp", { phone: LANDLINE })
          )) as ApiError

          expect(error.response.status).toEqual(400)
          expect(error.response.data.message).toContain("INVALID_PHONE")
        })

        it("accepts the same number typed on a Persian keyboard", async () => {
          // ۰۹… is what the default keyboard on our users' phones produces. The
          // four hand-rolled normalizers this replaced all called it invalid.
          const response = await api.post("/vendor/auth/phone/request-otp", {
            phone: PERSIAN_MOBILE,
          })

          expect(response.status).toEqual(200)

          const otp = container.resolve(MercurModules.OTP) as unknown as {
            listOtpCodes: (filters: {
              identifier: string
              actor_type: string
            }) => Promise<Array<{ id: string }>>
          }
          // Stored against the canonical Latin form, so the verify call that
          // follows — whatever digits it is typed in — finds this code.
          const stored = await otp.listOtpCodes({
            identifier: PERSIAN_MOBILE_LATIN,
            actor_type: "member",
          })
          expect(stored.length).toBeGreaterThan(0)
        })

        it("refuses a landline as a store phone", async () => {
          const error = (await failed(
            api.post(
              `/vendor/sellers/${seller.id}`,
              { phone: LANDLINE },
              vendorHeaders
            )
          )) as ApiError

          expect(error.response.status).toEqual(400)
        })

        it("refuses a landline on a member invite — nobody could accept it", async () => {
          const error = (await failed(
            api.post(
              `/vendor/sellers/${seller.id}/members`,
              { phone: LANDLINE, role_id: SellerRole.SELLER_ADMINISTRATION },
              vendorHeaders
            )
          )) as ApiError

          expect(error.response.status).toEqual(400)
        })

        it("refuses a landline on an operator-sent invite too", async () => {
          const error = (await failed(
            api.post(
              `/admin/sellers/${seller.id}/members/invite`,
              { phone: LANDLINE, role_id: SellerRole.SELLER_ADMINISTRATION },
              adminHeaders
            )
          )) as ApiError

          expect(error.response.status).toEqual(400)
        })
      })

      describe("an operator can correct a store phone", () => {
        const verifyStorePhone = async () => {
          const sellerModule = container.resolve(
            MercurModules.SELLER
          ) as unknown as {
            updateSellers: (data: {
              id: string
              phone_verified_at: Date
            }) => Promise<unknown>
          }
          await sellerModule.updateSellers({
            id: seller.id,
            phone_verified_at: new Date(),
          })
        }

        const readSeller = async () => {
          const { data } = await api.get(
            `/admin/sellers/${seller.id}`,
            adminHeaders
          )
          return data.seller as {
            phone: string | null
            phone_verified_at: string | null
          }
        }

        it("saves the phone without being handed an email", async () => {
          // The panel used to demand one here, which is what made a
          // phone-registered store uneditable.
          const response = await api.post(
            `/admin/sellers/${seller.id}`,
            { phone: "+98 912 000 1122" },
            adminHeaders
          )

          expect(response.status).toEqual(200)
          // Stored canonically whatever spelling arrives.
          expect(response.data.seller.phone).toEqual("09120001122")
        })

        it("drops the SMS verification the old number had earned", async () => {
          await api.post(
            `/admin/sellers/${seller.id}`,
            { phone: "09120001122" },
            adminHeaders
          )
          await verifyStorePhone()

          await api.post(
            `/admin/sellers/${seller.id}`,
            { phone: "09120003344" },
            adminHeaders
          )

          expect((await readSeller()).phone_verified_at).toBeNull()
        })

        it("does not touch the phone when the update never mentions it", async () => {
          // The shape of an unrelated edit: a closure window, a status change, a
          // premium toggle. An absent key means "leave it alone" — a validator
          // that folds it to null here erases a verified store number on every
          // one of those saves.
          await api.post(
            `/admin/sellers/${seller.id}`,
            { phone: "09120001122" },
            adminHeaders
          )
          await verifyStorePhone()

          await api.post(
            `/admin/sellers/${seller.id}`,
            { is_premium: true },
            adminHeaders
          )

          const after = await readSeller()
          expect(after.phone).toEqual("09120001122")
          expect(after.phone_verified_at).not.toBeNull()
        })

        it("keeps it when the number is the same, spelled differently", async () => {
          await api.post(
            `/admin/sellers/${seller.id}`,
            { phone: "09120001122" },
            adminHeaders
          )
          await verifyStorePhone()

          await api.post(
            `/admin/sellers/${seller.id}`,
            { phone: "+989120001122" },
            adminHeaders
          )

          expect((await readSeller()).phone_verified_at).not.toBeNull()
        })
      })

      describe("an operator can recover a locked-out producer", () => {
        const OLD_MEMBER_PHONE = "09125550000"
        const NEW_MEMBER_PHONE = "09125551111"

        let memberId: string
        let memberAuthIdentityId: string

        const phoneIdentities = async (phone: string) => {
          const auth = container.resolve<IAuthModuleService>(Modules.AUTH)
          return auth.listProviderIdentities({
            provider: "phone-otp",
            entity_id: phone,
          })
        }

        beforeEach(async () => {
          // What phone registration leaves behind: the member's login phone and
          // an auth identity whose id IS that number.
          const sellerModule = container.resolve(
            MercurModules.SELLER
          ) as unknown as {
            updateMembers: (data: {
              id: string
              phone: string
            }) => Promise<unknown>
            listMembers: (filters: Record<string, unknown>) => Promise<
              Array<{ id: string }>
            >
          }
          const [member] = await sellerModule.listMembers({
            email: "phone-guard@test.com",
          })
          memberId = member.id
          await sellerModule.updateMembers({
            id: memberId,
            phone: OLD_MEMBER_PHONE,
          })

          const auth = container.resolve<IAuthModuleService>(Modules.AUTH)
          const identity = await auth.createAuthIdentities({
            provider_identities: [
              { provider: "phone-otp", entity_id: OLD_MEMBER_PHONE },
            ],
            app_metadata: { member_id: memberId },
          })
          memberAuthIdentityId = identity.id
        })

        it("moves the sign-in number, so the new one opens the panel", async () => {
          const response = await api.post(
            `/admin/members/${memberId}/phone`,
            { phone: NEW_MEMBER_PHONE },
            adminHeaders
          )

          expect(response.status).toEqual(200)
          expect(response.data.member.phone).toEqual(NEW_MEMBER_PHONE)
          expect(response.data.login_identity_updated).toBe(true)
          expect(memberAuthIdentityId).toBeTruthy()

          expect(await phoneIdentities(OLD_MEMBER_PHONE)).toHaveLength(0)
          expect(await phoneIdentities(NEW_MEMBER_PHONE)).toHaveLength(1)

          // End to end: the vendor login only knows the new number now.
          const err = (await failed(
            api.post("/vendor/auth/phone/request-otp", {
              phone: OLD_MEMBER_PHONE,
              mode: "login",
            })
          )) as ApiError
          expect(err.response.status).toEqual(404)

          const reachable = await api.post("/vendor/auth/phone/request-otp", {
            phone: NEW_MEMBER_PHONE,
            mode: "login",
          })
          expect(reachable.status).toEqual(200)
        })

        it("refuses the landline that locked them out in the first place", async () => {
          const err = (await failed(
            api.post(
              `/admin/members/${memberId}/phone`,
              { phone: LANDLINE },
              adminHeaders
            )
          )) as ApiError

          expect(err.response.status).toEqual(400)
          // And the old sign-in is untouched.
          expect(await phoneIdentities(OLD_MEMBER_PHONE)).toHaveLength(1)
        })

        it("refuses a number that already opens a shopper's account", async () => {
          const customerService = container.resolve<ICustomerModuleService>(
            Modules.CUSTOMER
          )
          const [customer] = await customerService.createCustomers([
            { phone: "09125559999", has_account: true },
          ])
          const auth = container.resolve<IAuthModuleService>(Modules.AUTH)
          await auth.createAuthIdentities({
            provider_identities: [
              { provider: "phone-otp", entity_id: "09125559999" },
            ],
            app_metadata: { customer_id: customer.id },
          })

          const err = (await failed(
            api.post(
              `/admin/members/${memberId}/phone`,
              { phone: "09125559999" },
              adminHeaders
            )
          )) as ApiError

          expect(err.response.status).toEqual(422)
          expect(err.response.data.message).toContain("PHONE_ALREADY_REGISTERED")
          expect(await phoneIdentities(OLD_MEMBER_PHONE)).toHaveLength(1)
        })
      })

      describe("an operator changing a shopper's number moves their sign-in", () => {
        const OLD = "09121110000"
        const NEW = "09121112222"

        let customerId: string

        const phoneIdentities = async (phone: string) => {
          const auth = container.resolve<IAuthModuleService>(Modules.AUTH)
          return auth.listProviderIdentities({
            provider: "phone-otp",
            entity_id: phone,
          })
        }

        beforeEach(async () => {
          // Exactly what the store's OTP sign-up leaves behind: a customer with
          // no email, and a login identity whose id IS the phone number.
          const customerService = container.resolve<ICustomerModuleService>(
            Modules.CUSTOMER
          )
          const [customer] = await customerService.createCustomers([
            { phone: OLD, has_account: true },
          ])
          customerId = customer.id

          const auth = container.resolve<IAuthModuleService>(Modules.AUTH)
          await auth.createAuthIdentities({
            provider_identities: [{ provider: "phone-otp", entity_id: OLD }],
            app_metadata: { customer_id: customer.id },
          })
        })

        it("re-points the login identity, so the old number stops working", async () => {
          const response = await api.post(
            `/admin/customers/${customerId}/phone`,
            { phone: NEW },
            adminHeaders
          )

          expect(response.status).toEqual(200)
          expect(response.data.customer.phone).toEqual(NEW)
          expect(response.data.login_identity_updated).toBe(true)

          expect(await phoneIdentities(OLD)).toHaveLength(0)
          expect(await phoneIdentities(NEW)).toHaveLength(1)

          // End to end: the old number no longer has an account to sign in to.
          const error = (await failed(
            api.post(
              "/store/auth/phone/request-otp",
              { phone: OLD, mode: "login" },
              storeHeaders
            )
          )) as ApiError
          expect(error.response.status).toEqual(404)

          const stillReachable = await api.post(
            "/store/auth/phone/request-otp",
            { phone: NEW, mode: "login" },
            storeHeaders
          )
          expect(stillReachable.status).toEqual(200)
        })

        it("refuses a landline", async () => {
          const error = (await failed(
            api.post(
              `/admin/customers/${customerId}/phone`,
              { phone: LANDLINE },
              adminHeaders
            )
          )) as ApiError

          expect(error.response.status).toEqual(400)
        })

        it("refuses a number that already opens someone else's account", async () => {
          const customerService = container.resolve<ICustomerModuleService>(
            Modules.CUSTOMER
          )
          await customerService.createCustomers([
            { phone: "09129990000", has_account: true },
          ])

          const error = (await failed(
            api.post(
              `/admin/customers/${customerId}/phone`,
              { phone: "09129990000" },
              adminHeaders
            )
          )) as ApiError

          // DUPLICATE_ERROR is a 422 in Medusa's error handler, which also
          // leaves the message intact (unlike CONFLICT, which it rewrites).
          expect(error.response.status).toEqual(422)
          expect(error.response.data.message).toContain(
            "PHONE_ALREADY_REGISTERED"
          )
          // And nothing moved.
          expect(await phoneIdentities(OLD)).toHaveLength(1)
        })
      })
    })
  },
})
