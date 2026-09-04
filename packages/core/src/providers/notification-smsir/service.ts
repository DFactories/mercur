import {
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
} from "@medusajs/framework/types"
import { AbstractNotificationProviderService, MedusaError } from "@medusajs/framework/utils"

import { createSmsIrClient, SmsIrClient, SmsIrParam } from "../smsir/client"

type SmsIrNotificationOptions = {
  apiKey?: string
  baseUrl?: string
  channels?: string[]
}

/**
 * Medusa Notification provider for the `sms` channel, backed by sms.ir.
 *
 * It is intentionally "dumb": the notification pipeline
 * (workflows/notification/send-notification) decides whether SMS is allowed for
 * an event and resolves the approved `template_id` + ordered `parameters` from
 * the per-event DB config, then passes them in `notification.data`. This
 * provider only forwards them to sms.ir.
 *
 * OTP is NOT delivered through this provider — it uses the sms.ir client
 * directly from the auth/otp path so it can never be disabled by notification
 * settings.
 */
class SmsIrNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "notification-smsir"

  protected readonly client_: SmsIrClient

  constructor(_cradle: Record<string, unknown>, options: SmsIrNotificationOptions = {}) {
    super()
    this.client_ = createSmsIrClient({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
    })
  }

  async send(
    notification: ProviderSendNotificationDTO
  ): Promise<ProviderSendNotificationResultsDTO> {
    const data = (notification.data ?? {}) as {
      template_id?: number | string
      parameters?: SmsIrParam[]
      /** Free-text body. Set only by the admin's manual sender. */
      text?: string
      /**
       * Sender line for a free-text send, chosen by the operator in the panel.
       * Absent means "let the client work it out" — which succeeds only when
       * the account has exactly one line.
       */
      line_number?: number | string
    }

    if (!notification.to) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "notification-smsir requires a recipient phone number in notification.to"
      )
    }

    // Free-text send. Checked BEFORE the template branch and gated on the
    // absence of a template id, so an event that carries both cannot silently
    // bypass its approved template: the template is what an operator audits.
    const text = typeof data.text === "string" ? data.text.trim() : ""
    if (text && !data.template_id) {
      const line = Number(data.line_number)
      const bulk = await this.client_.sendBulk(
        [notification.to],
        text,
        Number.isFinite(line) && line > 0 ? line : undefined
      )
      return { id: bulk.messageId ? String(bulk.messageId) : undefined }
    }

    const templateId = Number(data.template_id)
    if (!templateId || Number.isNaN(templateId)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "notification-smsir requires a numeric sms.ir template id in notification.data.template_id (or a `text` body for a free-text send)"
      )
    }

    const parameters = Array.isArray(data.parameters) ? data.parameters : []
    const result = await this.client_.sendVerify(notification.to, templateId, parameters)

    return { id: result.messageId ? String(result.messageId) : undefined }
  }
}

export default SmsIrNotificationProviderService
