import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  AuthIdentityDTO,
  IAuthModuleService,
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
const OTP_TEMPLATE_ID = Number(process.env.SMSIR_OTP_TEMPLATE_ID ?? 0)
const OTP_PARAM_NAME = process.env.SMSIR_OTP_PARAM_NAME ?? "CODE"

export const RequestOtpSchema = z.object({
  phone: z.string().min(8).max(20),
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

/** POST handler: generate an OTP and deliver it via sms.ir. Always 200 (never leaks whether the number exists). */
export function createRequestOtpHandler(actorType: ActorType) {
  return async (req: MedusaRequest, res: MedusaResponse): Promise<void> => {
    const { phone: rawPhone } = RequestOtpSchema.parse(req.body)
    const phone = normalizeIranPhone(rawPhone)

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

    const token = await mintSessionToken(req, authIdentity, actorType)
    res.status(200).json({ token })
  }
}
