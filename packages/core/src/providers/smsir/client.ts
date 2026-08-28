/**
 * Low-level transport for the sms.ir Web Service (https://sms.ir/web-service/).
 *
 * This is the ONLY place that talks to sms.ir over HTTP. It is shared by two
 * completely separate pathways:
 *   1. The OTP / auth path (modules/otp + providers/auth-phone-otp) — calls
 *      {@link SmsIrClient.sendVerify} directly. Never goes through the
 *      notification module or its per-event settings.
 *   2. The transactional notification path (providers/notification-smsir) —
 *      also uses {@link SmsIrClient.sendVerify} because sms.ir delivers every
 *      message through a pre-approved template referenced by `templateId`.
 *
 * Only the API key is read from the environment (SMSIR_API_KEY). Template ids
 * live in the database, never in env.
 */

export type SmsIrParam = {
  /** The placeholder name as defined in the approved sms.ir template, e.g. "CODE". */
  name: string
  /** The runtime value substituted into the template. */
  value: string
}

export type SmsIrClientOptions = {
  apiKey?: string
  baseUrl?: string
}

export type SmsIrSendResult = {
  status: "sent" | "skipped"
  /** sms.ir message id, present when actually sent. */
  messageId?: number
  raw?: unknown
}

/** Shape of a successful sms.ir REST response. `status === 1` means success. */
type SmsIrResponse = {
  status?: number
  message?: string
  data?: { messageId?: number; cost?: number }
}

const DEFAULT_BASE_URL = "https://api.sms.ir/v1"

export class SmsIrClient {
  private readonly apiKey?: string
  private readonly baseUrl: string

  constructor(options: SmsIrClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.SMSIR_API_KEY
    this.baseUrl = (
      options.baseUrl ??
      process.env.SMSIR_BASE_URL ??
      DEFAULT_BASE_URL
    ).replace(/\/+$/, "")
  }

  /** True when an API key is available and real delivery will be attempted. */
  get isConfigured(): boolean {
    return Boolean(this.apiKey)
  }

  /**
   * POST to `/send/verify`, retrying once when the request never reached sms.ir.
   *
   * A DNS, TCP or TLS failure rejects `fetch` before any response exists, so
   * nothing was queued and a second attempt cannot duplicate a message. These
   * are routine on the networks this runs on — the reported incident was
   * `ECONNRESET` mid-TLS-handshake against api.sms.ir — and they clear on the
   * next attempt. Failures that DID produce a response (rejected template,
   * invalid key, no credit) are deterministic and deliberately not retried.
   */
  private async postSendVerify(body: string): Promise<Response> {
    const url = `${this.baseUrl}/send/verify`
    const init: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-API-KEY": this.apiKey as string,
      },
      body,
    }

    try {
      return await fetch(url, init)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(
        `[smsir] could not reach ${url} (${
          error instanceof Error ? error.message : String(error)
        }) — retrying once`
      )
      return await fetch(url, init)
    }
  }

  /**
   * Template-based fast send — sms.ir `POST /send/verify`. Used for OTP codes
   * and for transactional notifications (both are template-driven on sms.ir).
   *
   * When no API key is configured the call is a no-op that logs the intended
   * message (dev mode), so local development and tests never hit the network.
   */
  async sendVerify(
    mobile: string,
    templateId: number,
    parameters: SmsIrParam[]
  ): Promise<SmsIrSendResult> {
    if (!this.isConfigured) {
      // eslint-disable-next-line no-console
      console.warn(
        `[smsir] SMSIR_API_KEY not set — skipping SMS to ${mobile} (template ${templateId}); parameters=${JSON.stringify(
          parameters
        )}`
      )
      return { status: "skipped" }
    }

    const response = await this.postSendVerify(
      JSON.stringify({ mobile, templateId, parameters })
    )

    let body: SmsIrResponse = {}
    try {
      body = (await response.json()) as SmsIrResponse
    } catch {
      body = {}
    }

    if (!response.ok || body.status !== 1) {
      throw new Error(
        `[smsir] send/verify failed (http ${response.status}, status ${
          body.status ?? "n/a"
        }): ${body.message ?? "unknown error"}`
      )
    }

    return { status: "sent", messageId: body.data?.messageId, raw: body }
  }
}

export function createSmsIrClient(options?: SmsIrClientOptions): SmsIrClient {
  return new SmsIrClient(options)
}
