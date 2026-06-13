import {
  AuthenticatedMedusaRequest,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  AuthIdentityDTO,
  IAuthModuleService,
  ICustomerModuleService,
} from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { MercurModules } from "@mercurjs/types"
import { z } from "zod"

import OtpModuleService from "../../modules/otp/service"
import { createSmsIrClient } from "../../providers/smsir/client"

/**
 * Phone (OTP) authentication, implemented as thin custom routes rather than a
 * Medusa auth provider.
 *
 * Why no auth provider: an auth provider runs inside the Auth module's isolated
 * container and cannot reliably resolve the OTP module's service. These routes
 * run with the full request scope, so they verify the code via the OTP module
 * and mint the same session token Medusa's standard auth route returns — using
 * the public `generateJwtToken`. The "phone-otp" string below is only a
 * provider-identity label on the created auth identity; the email/password flow
 * is untouched.
 */

type ActorType = "member" | "customer"

const PHONE_OTP_PROVIDER = "phone-otp"
/** Distinct OTP namespace so store-phone codes never collide with login codes. */
const SELLER_PHONE_ACTOR = "seller_phone"
const OTP_TEMPLATE_ID = Number(process.env.SMSIR_OTP_TEMPLATE_ID ?? 0)
const OTP_PARAM_NAME = process.env.SMSIR_OTP_PARAM_NAME ?? "CODE"

export const RequestOtpSchema = z.object({
  phone: z.string().min(8).max(20),
  /**
   * "login" requires an existing account for the phone; "register" requires
   * none. Omitted (e.g. external storefront) keeps the unified login=register
   * behavior with no existence check.
   */
  mode: z.enum(["login", "register"]).optional(),
})

export const VerifyOtpSchema = z.object({
  phone: z.string().min(8).max(20),
  code: z.string().min(4).max(10),
})

/** Normalize common Iranian mobile formats to a single local form (09xxxxxxxxx). */
export function normalizeIranPhone(input: string): string {
  let p = input.replace(/[\s-]/g, "")
  if (p.startsWith("+98")) {
    p = "0" + p.slice(3)
  } else if (p.startsWith("0098")) {
    p = "0" + p.slice(4)
  } else if (p.startsWith("98") && p.length === 12) {
    p = "0" + p.slice(2)
  }
  return p
}

type SellerModuleLike = {
  listMembers: (
    filters: Record<string, unknown>
  ) => Promise<Array<{ id: string; phone?: string | null }>>
  listSellers: (
    filters: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => Promise<
    Array<{
      id: string
      phone?: string | null
      phone_verified_at?: Date | null
      members?: { id: string }[]
    }>
  >
}

/** Seller module surface used by the store-phone verification flow. */
type SellerServiceLike = SellerModuleLike & {
  retrieveSeller: (id: string) => Promise<{
    id: string
    phone?: string | null
    phone_verified_at?: Date | null
  }>
  updateSellers: (data: {
    id: string
    phone_verified_at?: Date | null
  }) => Promise<unknown>
}

/** Iranian mobile in canonical local form: 09 + 9 digits = 11 digits. */
const IRAN_MOBILE_RE = /^09\d{9}$/

function assertValidPhone(phone: string): void {
  if (!IRAN_MOBILE_RE.test(phone)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "INVALID_PHONE")
  }
}

/** Common stored formats for an Iranian phone, so we match legacy/profile values. */
function phoneVariants(normalized: string): string[] {
  const variants = new Set<string>([normalized])
  if (normalized.startsWith("0")) {
    const local = normalized.slice(1)
    variants.add(local)
    variants.add("98" + local)
    variants.add("+98" + local)
    variants.add("0098" + local)
  }
  return Array.from(variants)
}

/**
 * Find an existing member (vendor user) by their *login* phone. Login identity is
 * the member phone only — the store phone (seller.phone) is a separate verified
 * contact, never a login credential.
 */
async function findMemberIdByPhone(
  req: MedusaRequest,
  phone: string
): Promise<string | undefined> {
  const seller = req.scope.resolve<SellerModuleLike>(MercurModules.SELLER)
  const members = await seller.listMembers({ phone: phoneVariants(phone) })
  return members[0]?.id
}

/**
 * A phone is "taken" (owned) when it's a member's login phone OR a *verified*
 * store phone. Unverified store phones don't lock anything — multiple stores may
 * hold the same unverified number, and the first to verify it wins. Used to gate
 * registration and store-phone verification.
 */
async function isPhoneTaken(
  req: MedusaRequest,
  phone: string
): Promise<boolean> {
  if (await findMemberIdByPhone(req, phone)) {
    return true
  }
  const seller = req.scope.resolve<SellerModuleLike>(MercurModules.SELLER)
  const sellers = await seller.listSellers({ phone: phoneVariants(phone) })
  return sellers.some((s) => !!s.phone_verified_at)
}

/** Find an existing customer whose phone matches, in any common format. */
async function findCustomerIdByPhone(
  customerService: ICustomerModuleService,
  phone: string
): Promise<string | undefined> {
  // `phone` is a real customer column but isn't in the typed filter props.
  const filters = { phone: phoneVariants(phone) } as Parameters<
    ICustomerModuleService["listCustomers"]
  >[0]
  const customers = await customerService.listCustomers(filters)
  return customers[0]?.id
}

type HttpConfig = {
  jwtSecret: string
  jwtExpiresIn?: string
  jwtOptions?: Record<string, unknown>
}

async function mintSessionToken(
  req: MedusaRequest,
  authIdentity: AuthIdentityDTO,
  actorType: ActorType
): Promise<string> {
  const configModule = req.scope.resolve<{
    projectConfig: { http: HttpConfig }
  }>(ContainerRegistrationKeys.CONFIG_MODULE)
  const { http } = configModule.projectConfig

  const entityIdKey = `${actorType}_id`
  const entityId = (authIdentity.app_metadata?.[entityIdKey] ?? undefined) as
    | string
    | undefined

  // Mirror Medusa's generateJwtTokenForAuthIdentity: embed RBAC roles when the
  // actor already exists (it won't on first sign-in, before seller/customer
  // creation — which matches the emailpass register flow).
  let roles: string[] | undefined
  if (entityId) {
    try {
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
      const { data } = await query.graph({
        entity: actorType,
        fields: ["rbac_roles.id"],
        filters: { id: entityId },
      })
      const rows = data as Array<{ rbac_roles?: Array<{ id: string }> }>
      roles = rows?.[0]?.rbac_roles?.map((r) => r.id)
    } catch {
      // actor type without RBAC roles (e.g. customer) — ignore
    }
  }

  return generateJwtToken(
    {
      actor_id: entityId ?? "",
      actor_type: actorType,
      auth_identity_id: authIdentity.id ?? "",
      app_metadata: { [entityIdKey]: entityId, roles },
      user_metadata: {},
    },
    {
      secret: http.jwtSecret,
      expiresIn: http.jwtExpiresIn,
      jwtOptions: http.jwtOptions,
    }
  )
}

/**
 * Ensure a customer entity exists and is linked to the verified phone auth
 * identity. Phone-only customers are allowed (Medusa's customer.email is
 * nullable) — but createCustomerAccountWorkflow requires an email, so we create
 * the customer directly via the module and link it ourselves. Idempotent: skips
 * when the auth identity already points at a customer.
 */
async function ensureCustomerForAuthIdentity(
  req: MedusaRequest,
  authIdentity: AuthIdentityDTO,
  phone: string
): Promise<AuthIdentityDTO> {
  if (authIdentity.app_metadata?.customer_id) {
    return authIdentity
  }

  const customerService = req.scope.resolve<ICustomerModuleService>(
    Modules.CUSTOMER
  )

  // Reuse an existing customer with this phone (e.g. created earlier by email);
  // otherwise create a phone-only one.
  let customerId = await findCustomerIdByPhone(customerService, phone)
  if (!customerId) {
    const [customer] = await customerService.createCustomers([
      { phone, has_account: true },
    ])
    customerId = customer.id
  }

  const authModule = req.scope.resolve<IAuthModuleService>(Modules.AUTH)
  await authModule.updateAuthIdentities({
    id: authIdentity.id,
    app_metadata: {
      ...(authIdentity.app_metadata ?? {}),
      customer_id: customerId,
    },
  })

  return authModule.retrieveAuthIdentity(authIdentity.id, {
    relations: ["provider_identities"],
  })
}

/** POST handler: generate an OTP and deliver it via sms.ir. Always 200 (never leaks whether the number exists). */
export function createRequestOtpHandler(actorType: ActorType) {
  return async (req: MedusaRequest, res: MedusaResponse): Promise<void> => {
    const { phone: rawPhone, mode } = RequestOtpSchema.parse(req.body)
    const phone = normalizeIranPhone(rawPhone)
    assertValidPhone(phone)

    // Enforce login/register separation before spending an SMS.
    // - login checks the *login identity* exists (member phone / customer phone)
    // - register checks the number isn't *owned* (member phone or verified store phone)
    if (mode) {
      const exists =
        actorType === "member"
          ? mode === "register"
            ? await isPhoneTaken(req, phone)
            : !!(await findMemberIdByPhone(req, phone))
          : !!(await findCustomerIdByPhone(
              req.scope.resolve<ICustomerModuleService>(Modules.CUSTOMER),
              phone
            ))
      if (mode === "login" && !exists) {
        throw new MedusaError(
          MedusaError.Types.NOT_FOUND,
          "PHONE_NOT_REGISTERED"
        )
      }
      if (mode === "register" && exists) {
        throw new MedusaError(
          MedusaError.Types.DUPLICATE_ERROR,
          "PHONE_ALREADY_REGISTERED"
        )
      }
    }

    const otp = req.scope.resolve<OtpModuleService>(MercurModules.OTP)
    const { code } = await otp.requestOtp({
      identifier: phone,
      actor_type: actorType,
    })

    const client = createSmsIrClient()
    await client.sendVerify(phone, OTP_TEMPLATE_ID, [
      { name: OTP_PARAM_NAME, value: code },
    ])

    res.status(200).json({ success: true })
  }
}

/** POST handler: verify an OTP and return a session token (find-or-create the auth identity). */
export function createVerifyOtpHandler(actorType: ActorType) {
  return async (req: MedusaRequest, res: MedusaResponse): Promise<void> => {
    const { phone: rawPhone, code } = VerifyOtpSchema.parse(req.body)
    const phone = normalizeIranPhone(rawPhone)
    assertValidPhone(phone)

    const otp = req.scope.resolve<OtpModuleService>(MercurModules.OTP)
    await otp.verifyOtp({ identifier: phone, actor_type: actorType, code })

    const authModule = req.scope.resolve<IAuthModuleService>(Modules.AUTH)

    const providerIdentities = await authModule.listProviderIdentities(
      { provider: PHONE_OTP_PROVIDER, entity_id: phone },
      { relations: ["auth_identity"], take: 1 }
    )

    const existingAuthIdentityId = providerIdentities[0]?.auth_identity_id

    let authIdentity: AuthIdentityDTO
    if (existingAuthIdentityId) {
      authIdentity = await authModule.retrieveAuthIdentity(
        existingAuthIdentityId,
        { relations: ["provider_identities"] }
      )
    } else {
      authIdentity = await authModule.createAuthIdentities({
        provider_identities: [
          { provider: PHONE_OTP_PROVIDER, entity_id: phone },
        ],
      })
    }

    if (!authIdentity?.id) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Could not resolve an auth identity for the verified phone number."
      )
    }

    if (actorType === "customer") {
      // Customers have no onboarding step: create (or reuse) the customer here.
      authIdentity = await ensureCustomerForAuthIdentity(req, authIdentity, phone)
    } else if (!authIdentity.app_metadata?.member_id) {
      // Link an existing member whose login phone matches, so phone login reaches
      // their existing seller(s). If none exists, they go through onboarding.
      const memberId = await findMemberIdByPhone(req, phone)
      if (memberId) {
        await authModule.updateAuthIdentities({
          id: authIdentity.id,
          app_metadata: {
            ...(authIdentity.app_metadata ?? {}),
            member_id: memberId,
          },
        })
        authIdentity = await authModule.retrieveAuthIdentity(authIdentity.id, {
          relations: ["provider_identities"],
        })
      }
    }

    const token = await mintSessionToken(req, authIdentity, actorType)
    res.status(200).json({ token })
  }
}

export const SellerPhoneVerifySchema = z.object({
  code: z.string().min(4).max(10),
})

/** Resolve the current seller + its (validated) phone for the store-phone flow. */
async function resolveSellerPhoneContext(req: MedusaRequest): Promise<{
  sellerModule: SellerServiceLike
  sellerId: string
  memberId: string | undefined
  seller: { id: string; phone?: string | null; phone_verified_at?: Date | null }
  phone: string
}> {
  const sellerContext = (req as AuthenticatedMedusaRequest).seller_context
  const sellerId = sellerContext?.seller_id
  if (!sellerId) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "No seller selected for this request."
    )
  }

  const sellerModule = req.scope.resolve<SellerServiceLike>(
    MercurModules.SELLER
  )
  const seller = await sellerModule.retrieveSeller(sellerId)
  if (!seller.phone) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "PHONE_NOT_SET")
  }
  const phone = normalizeIranPhone(seller.phone)
  assertValidPhone(phone)

  return {
    sellerModule,
    sellerId,
    memberId: sellerContext?.seller_member?.member_id,
    seller,
    phone,
  }
}

/**
 * POST /vendor/sellers/me/phone/request-otp — start verification of the selected
 * store's phone. Auto-verifies (no SMS) when the store phone is the owner's own
 * verified login phone; errors if the number is already owned by another account.
 */
export function createSellerPhoneRequestOtpHandler() {
  return async (req: MedusaRequest, res: MedusaResponse): Promise<void> => {
    const { sellerModule, sellerId, memberId, seller, phone } =
      await resolveSellerPhoneContext(req)

    if (seller.phone_verified_at) {
      res.status(200).json({ verified: true })
      return
    }

    // Auto-verify when the store phone is the owner's own login phone (already
    // OTP-proven at registration) — no second code needed.
    if (memberId) {
      const [member] = await sellerModule.listMembers({ id: [memberId] })
      if (member?.phone && normalizeIranPhone(member.phone) === phone) {
        await sellerModule.updateSellers({
          id: sellerId,
          phone_verified_at: new Date(),
        })
        res.status(200).json({ verified: true })
        return
      }
    }

    // Owned by someone else (a member's login phone, or another store's verified
    // phone) — refuse before spending an SMS.
    if (await isPhoneTaken(req, phone)) {
      throw new MedusaError(
        MedusaError.Types.DUPLICATE_ERROR,
        "PHONE_ALREADY_REGISTERED"
      )
    }

    const otp = req.scope.resolve<OtpModuleService>(MercurModules.OTP)
    const { code } = await otp.requestOtp({
      identifier: phone,
      actor_type: SELLER_PHONE_ACTOR,
    })

    const client = createSmsIrClient()
    await client.sendVerify(phone, OTP_TEMPLATE_ID, [
      { name: OTP_PARAM_NAME, value: code },
    ])

    res.status(200).json({ success: true })
  }
}

/**
 * POST /vendor/sellers/me/phone/verify-otp — confirm the store phone with the
 * code. Re-checks ownership (race: another account may have verified the same
 * number meanwhile) before marking the store phone verified.
 */
export function createSellerPhoneVerifyOtpHandler() {
  return async (req: MedusaRequest, res: MedusaResponse): Promise<void> => {
    const { code } = SellerPhoneVerifySchema.parse(req.body)
    const { sellerModule, sellerId, phone } =
      await resolveSellerPhoneContext(req)

    const otp = req.scope.resolve<OtpModuleService>(MercurModules.OTP)
    await otp.verifyOtp({
      identifier: phone,
      actor_type: SELLER_PHONE_ACTOR,
      code,
    })

    if (await isPhoneTaken(req, phone)) {
      throw new MedusaError(
        MedusaError.Types.DUPLICATE_ERROR,
        "PHONE_ALREADY_REGISTERED"
      )
    }

    await sellerModule.updateSellers({
      id: sellerId,
      phone_verified_at: new Date(),
    })

    res.status(200).json({ verified: true })
  }
}
