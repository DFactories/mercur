import crypto from "crypto"

import { InferEntityType } from "@medusajs/framework/types"
import { MedusaError, MedusaService } from "@medusajs/framework/utils"

import { OtpCode } from "./models"

export type RequestOtpInput = {
  identifier: string
  actor_type: string
}

export type RequestOtpResult = {
  /** Id of the stored code, so a caller whose delivery fails can discard it via {@link OtpModuleService.discardOtp}. */
  id: string
  /** Plaintext code — returned ONLY to the caller (auth route) to hand to the SMS transport. Never exposed over HTTP. */
  code: string
  expires_at: Date
}

export type VerifyOtpInput = {
  identifier: string
  actor_type: string
  code: string
}

const OTP_TTL_SECONDS = Number(process.env.OTP_TTL_SECONDS ?? 120)
const OTP_CODE_LENGTH = Number(process.env.OTP_CODE_LENGTH ?? 5)
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS ?? 5)
const OTP_RESEND_COOLDOWN_SECONDS = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS ?? 60)
const OTP_SECRET =
  process.env.OTP_SECRET ?? process.env.JWT_SECRET ?? "mercur-otp-secret"

function hashCode(identifier: string, code: string): string {
  return crypto
    .createHmac("sha256", OTP_SECRET)
    .update(`${identifier}:${code}`)
    .digest("hex")
}

function generateNumericCode(length: number): string {
  const upperBound = 10 ** length
  return crypto.randomInt(0, upperBound).toString().padStart(length, "0")
}

/**
 * Stores and verifies one-time passcodes for phone authentication.
 *
 * Deliberately decoupled from SMS delivery: `requestOtp` returns the plaintext
 * code to its caller (the auth route/provider), which sends it via the sms.ir
 * client. This keeps the OTP store independent of the transport and of the
 * notification settings.
 */
class OtpModuleService extends MedusaService({ OtpCode }) {
  async requestOtp(input: RequestOtpInput): Promise<RequestOtpResult> {
    const { identifier, actor_type } = input

    // Enforce a resend cooldown to limit abuse.
    const [latest] = await this.listOtpCodes(
      { identifier, actor_type },
      { order: { created_at: "DESC" }, take: 1 }
    )
    if (latest && !latest.consumed_at) {
      const createdAt = new Date(
        latest.created_at as unknown as string
      ).getTime()
      const elapsedMs = Date.now() - createdAt
      if (elapsedMs < OTP_RESEND_COOLDOWN_SECONDS * 1000) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          `Please wait before requesting another code.`
        )
      }
    }

    const code = generateNumericCode(OTP_CODE_LENGTH)
    const expires_at = new Date(Date.now() + OTP_TTL_SECONDS * 1000)

    const record = await this.createOtpCodes({
      identifier,
      actor_type,
      code_hash: hashCode(identifier, code),
      expires_at,
      attempts: 0,
    })

    return { id: record.id, code, expires_at }
  }

  /**
   * Drop a code whose delivery failed, so the resend cooldown is not spent on
   * an SMS the user never received. Without this a transport error (sms.ir
   * unreachable, TLS reset) leaves the record behind and the user's immediate
   * retry — the correct reaction — is refused with "Please wait before
   * requesting another code" until the cooldown lapses.
   *
   * Deleting rather than consuming: an undelivered code was never a valid
   * credential, so it should leave no trace for `verifyOtp` to find.
   */
  async discardOtp(id: string): Promise<void> {
    await this.deleteOtpCodes(id)
  }

  async verifyOtp(input: VerifyOtpInput): Promise<boolean> {
    const { identifier, actor_type, code } = input

    const [record] = await this.listOtpCodes(
      { identifier, actor_type, consumed_at: null },
      { order: { created_at: "DESC" }, take: 1 }
    )

    if (!record) {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "No active verification code. Please request a new one."
      )
    }

    if (new Date(record.expires_at as unknown as string).getTime() < Date.now()) {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "Verification code has expired. Please request a new one."
      )
    }

    if ((record.attempts ?? 0) >= OTP_MAX_ATTEMPTS) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Too many incorrect attempts. Please request a new code."
      )
    }

    const matches = crypto.timingSafeEqual(
      Buffer.from(record.code_hash),
      Buffer.from(hashCode(identifier, code))
    )

    if (!matches) {
      await this.updateOtpCodes({
        id: record.id,
        attempts: (record.attempts ?? 0) + 1,
      })
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "Invalid verification code."
      )
    }

    await this.updateOtpCodes({ id: record.id, consumed_at: new Date() })
    return true
  }
}

export type OtpCodeDTO = InferEntityType<typeof OtpCode>
export default OtpModuleService
