import crypto from "crypto"

import { Context, InferEntityType } from "@medusajs/framework/types"
import {
  InjectTransactionManager,
  MedusaContext,
  MedusaError,
  MedusaService,
} from "@medusajs/framework/utils"

import { OtpCode, OtpVerifyFailure } from "./models"

export type RequestOtpInput = {
  identifier: string
  actor_type: string
  /**
   * The address asking. Counted against the per-address hourly cap; a caller
   * that leaves it out is held only by the platform-wide cap.
   */
  ip?: string | null
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
  /**
   * The address guessing. Its wrong guesses are counted across every number; a
   * caller that leaves it out is held only by the per-number limits.
   */
  ip?: string | null
}

const OTP_TTL_SECONDS = Number(process.env.OTP_TTL_SECONDS ?? 120)
const OTP_CODE_LENGTH = Number(process.env.OTP_CODE_LENGTH ?? 5)
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS ?? 5)
/**
 * Wrong guesses one number may collect, across ALL its codes, before it is
 * locked until the oldest of them leaves the window.
 *
 * The per-code limit alone was a rate, not a limit: every 120 seconds a new
 * code brought five new guesses, so a five-digit code fell to patience. The
 * price is that ten wrong guesses lock the real owner out for up to an hour.
 */
const OTP_MAX_FAILURES_PER_WINDOW = Number(
  process.env.OTP_MAX_FAILURES_PER_WINDOW ?? 10
)
const OTP_FAILURE_WINDOW_SECONDS = Number(
  process.env.OTP_FAILURE_WINDOW_SECONDS ?? 3600
)
/**
 * Wrong guesses one ADDRESS may collect in the failure window, across every
 * number it guesses at.
 *
 * The limits above are per number, so one client could spend ten guesses on
 * each of any list of numbers and never meet one. Read on every call, like the
 * send caps.
 */
const otpMaxFailuresPerAddress = () =>
  Number(process.env.OTP_MAX_FAILURES_PER_IP_PER_WINDOW ?? 30)
/**
 * How long before another code may be requested.
 *
 * Equal to the TTL by default, and that is the whole point: two different
 * numbers on one screen is what produced «کد otp منقضی نمی‌شود» — a 60-second
 * counter read as the code's lifetime, next to a code that still worked at 90.
 * Made equal, "you may ask for a new code" and "this code is dead" become the
 * same moment, so ONE counter tells the truth about both and the second one can
 * go. Still env-configurable: an operator who separates them again gets two
 * honest clocks back, because every client reads `resend_in` off the response.
 */
const OTP_RESEND_COOLDOWN_SECONDS = Number(
  process.env.OTP_RESEND_COOLDOWN_SECONDS ?? OTP_TTL_SECONDS
)
const OTP_SECRET =
  process.env.OTP_SECRET ?? process.env.JWT_SECRET ?? "mercur-otp-secret"

const OTP_SEND_WINDOW_SECONDS = 60 * 60

/**
 * How many codes may be SENT per hour: by one address, and by everyone.
 *
 * The cooldown limits one number to one code at a time and says nothing about
 * how many numbers are asked for, so a single client could have the platform
 * text any list of strangers. The per-address cap stops that client; the
 * platform-wide one bounds the bill when the address is forged or spread out.
 *
 * Read on every call rather than once at load, so an operator's change (and a
 * test's) applies without a restart.
 */
const otpSendCaps = () => ({
  perAddress: Number(process.env.OTP_MAX_SENDS_PER_IP_PER_HOUR ?? 10),
  platform: Number(process.env.OTP_MAX_SENDS_PER_HOUR ?? 500),
})

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
 * The two clocks a client has to be able to show, in seconds.
 *
 * BOTH, because showing only the cooldown is a bug that reached production: the
 * storefront displayed a 60-second «ارسال مجدد» counter, a shopper read it as
 * the code's lifetime, and the code was still accepted at 90 seconds — reported
 * as «کد otp منقضی نمی‌شود». Nothing was broken; the two numbers were simply
 * different and only one was on screen.
 *
 * The default now makes them EQUAL, which is the better answer to that report
 * than showing two counters: one number, and it is true of both. They stay two
 * fields because they remain two independent settings — a client must render
 * whatever the server actually says, not assume they still match.
 *
 * Exposed by the request route so a client never has to hardcode them. Both are
 * env-configurable, so a duplicated constant in a storefront would be wrong the
 * first time an operator changed one — and it would be wrong in the dangerous
 * direction, promising more time than the code has.
 */
export type OtpTiming = {
  /** How long the code stays valid. */
  expires_in: number
  /** How long before another code may be requested. */
  resend_in: number
}

export const otpTiming = (): OtpTiming => ({
  expires_in: OTP_TTL_SECONDS,
  resend_in: OTP_RESEND_COOLDOWN_SECONDS,
})

/**
 * Stores and verifies one-time passcodes for phone authentication.
 *
 * Deliberately decoupled from SMS delivery: `requestOtp` returns the plaintext
 * code to its caller (the auth route/provider), which sends it via the sms.ir
 * client. This keeps the OTP store independent of the transport and of the
 * notification settings.
 */
class OtpModuleService extends MedusaService({ OtpCode, OtpVerifyFailure }) {
  /**
   * {@link otpTiming}, reachable through the resolved module.
   *
   * The fork's own routes call the exported function; a consuming project that
   * only holds the module (it cannot deep-import into this package) needs this.
   */
  timing(): OtpTiming {
    return otpTiming()
  }

  /** Wrong guesses this number has collected inside the failure window. */
  protected async recentFailures_(
    identifier: string,
    actor_type: string,
    sharedContext: Context = {}
  ): Promise<number> {
    const since = new Date(Date.now() - OTP_FAILURE_WINDOW_SECONDS * 1000)
    const codes = await this.listOtpCodes(
      { identifier, actor_type, created_at: { $gte: since } },
      { select: ["attempts"] },
      sharedContext
    )
    return codes.reduce((sum, code) => sum + (code.attempts ?? 0), 0)
  }

  async requestOtp(input: RequestOtpInput): Promise<RequestOtpResult> {
    const { identifier, actor_type } = input

    // A locked number gets no new code: it could not be used, and each one
    // would cost an SMS.
    if (
      (await this.recentFailures_(identifier, actor_type)) >=
      OTP_MAX_FAILURES_PER_WINDOW
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Please wait before requesting another code.`
      )
    }

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

    // Counted then written, not atomically: a burst can overshoot a cap by the
    // few requests in flight, which a spending limit can live with.
    const caps = otpSendCaps()
    const since = new Date(Date.now() - OTP_SEND_WINDOW_SECONDS * 1000)
    const sentBy = async (filters: Record<string, unknown>) =>
      (
        await this.listAndCountOtpCodes(
          { ...filters, created_at: { $gte: since } },
          { select: ["id"], take: 1 }
        )
      )[1]

    if ((await sentBy({})) >= caps.platform) {
      // The one refusal that locks out people who did nothing: say so where an
      // operator will see it.
      console.error(
        `[otp] platform-wide cap of ${caps.platform} codes per hour reached; refusing new codes`
      )
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Please wait before requesting another code.`
      )
    }
    if (input.ip && (await sentBy({ ip: input.ip })) >= caps.perAddress) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Please wait before requesting another code.`
      )
    }

    const code = generateNumericCode(OTP_CODE_LENGTH)
    const expires_at = new Date(Date.now() + OTP_TTL_SECONDS * 1000)

    const record = await this.createOtpCodes({
      identifier,
      actor_type,
      ip: input.ip ?? null,
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
    const outcome = await this.checkOtp_(input)

    if (outcome === "none") {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "No active verification code. Please request a new one."
      )
    }
    if (outcome === "expired") {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "Verification code has expired. Please request a new one."
      )
    }
    if (outcome === "locked") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Too many incorrect attempts. Please request a new code."
      )
    }
    if (outcome === "invalid") {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "Invalid verification code."
      )
    }
    return true
  }

  /**
   * Judge one guess, with every guess at the same number in a queue.
   *
   * The attempt counter used to be read, compared and written back in three
   * separate statements, so fifty parallel guesses all read `attempts = 0` and
   * all were compared. The advisory lock makes read-compare-count one unit per
   * number.
   *
   * RETURNS the outcome instead of throwing: a throw would roll back the
   * transaction, and the count of a wrong guess with it.
   */
  @InjectTransactionManager()
  protected async checkOtp_(
    input: VerifyOtpInput,
    @MedusaContext() sharedContext: Context = {}
  ): Promise<"ok" | "none" | "expired" | "locked" | "invalid"> {
    const { identifier, actor_type, code, ip } = input

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = sharedContext as any
    await (ctx.transactionManager ?? ctx.manager).execute(
      "SELECT pg_advisory_xact_lock(hashtext(?))",
      [`otp:${actor_type}:${identifier}`]
    )

    if (ip) {
      // The address's guesses queue too, or parallel guesses at different
      // numbers would all read the same count. Always taken second.
      await (ctx.transactionManager ?? ctx.manager).execute(
        "SELECT pg_advisory_xact_lock(hashtext(?))",
        [`otp-ip:${ip}`]
      )
      const since = new Date(Date.now() - OTP_FAILURE_WINDOW_SECONDS * 1000)
      const [, failures] = await this.listAndCountOtpVerifyFailures(
        { ip, created_at: { $gte: since } },
        { select: ["id"], take: 1 },
        sharedContext
      )
      if (failures >= otpMaxFailuresPerAddress()) {
        return "locked"
      }
    }

    if (
      (await this.recentFailures_(identifier, actor_type, sharedContext)) >=
      OTP_MAX_FAILURES_PER_WINDOW
    ) {
      return "locked"
    }

    const [record] = await this.listOtpCodes(
      { identifier, actor_type, consumed_at: null },
      { order: { created_at: "DESC" }, take: 1 },
      sharedContext
    )

    if (!record) {
      return "none"
    }

    if (new Date(record.expires_at as unknown as string).getTime() < Date.now()) {
      return "expired"
    }

    if ((record.attempts ?? 0) >= OTP_MAX_ATTEMPTS) {
      return "locked"
    }

    const matches = crypto.timingSafeEqual(
      Buffer.from(record.code_hash),
      Buffer.from(hashCode(identifier, code))
    )

    if (!matches) {
      await this.updateOtpCodes(
        { id: record.id, attempts: (record.attempts ?? 0) + 1 },
        sharedContext
      )
      if (ip) {
        await this.createOtpVerifyFailures({ ip }, sharedContext)
      }
      return "invalid"
    }

    await this.updateOtpCodes(
      { id: record.id, consumed_at: new Date() },
      sharedContext
    )
    return "ok"
  }
}

export type OtpCodeDTO = InferEntityType<typeof OtpCode>
export default OtpModuleService
