import { INotificationModuleService, Logger } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  MercurModules,
  NotificationChannel,
  NotificationIntent,
  NotificationRecipient,
} from "@mercurjs/types"

import NotificationSettingsModuleService from "../../modules/notification-settings/service"
import { getNotificationEvent } from "../../notification/catalog"

export const sendNotificationWorkflowId = "send-notification"

/** Channels this pipeline delivers. `feed` is handled by other subscribers, not here. */
const PIPELINE_CHANNELS: NotificationChannel[] = ["email", "sms"]

type Delivery = {
  channel: NotificationChannel
  to: string
  template_id: string | null
  params_map: Record<string, unknown> | null
  subject: string | null
  data: Record<string, unknown>
}

type OutgoingMessage = {
  to: string
  channel: string
  template: string
  data?: Record<string, unknown>
  content?: { subject?: string; text?: string; html?: string }
  idempotency_key?: string
}

// --- Stage 1: resolve recipients (fan-out) -------------------------------
const resolveRecipientsStep = createStep(
  "resolve-notification-recipients",
  async (input: NotificationIntent, { container }) => {
    const event = getNotificationEvent(input.event_key)
    if (!event || event.system || !event.resolve) {
      return new StepResponse({ recipients: [] as NotificationRecipient[] })
    }
    const recipients = await event.resolve(input.payload, container)
    return new StepResponse({ recipients })
  }
)

// --- Stage 2: policy -> concrete deliveries -------------------------------
const planDeliveriesStep = createStep(
  "plan-notification-deliveries",
  async (
    input: { event_key: string; recipients: NotificationRecipient[] },
    { container }
  ) => {
    const settings = container.resolve<NotificationSettingsModuleService>(
      MercurModules.NOTIFICATION_SETTINGS
    )
    const channelConfig = await settings.getDeliveryConfig(input.event_key)
    const enabled = channelConfig.filter(
      (c) => c.enabled && PIPELINE_CHANNELS.includes(c.channel)
    )

    const deliveries: Delivery[] = []
    for (const recipient of input.recipients) {
      for (const channel of enabled) {
        // Capability filter: skip a channel the recipient can't receive.
        const to =
          channel.channel === "sms" ? recipient.phone : recipient.email
        if (!to) {
          continue
        }
        deliveries.push({
          channel: channel.channel,
          to,
          template_id: channel.template_id,
          params_map: channel.params_map,
          subject: channel.subject,
          data: recipient.data ?? {},
        })
      }
    }
    return new StepResponse({ deliveries })
  }
)

// --- Stage 3: template (email render / sms param-map) ---------------------
function buildBasicEmailHtml(
  subject: string,
  data: Record<string, unknown>
): string {
  const rows = Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== null && typeof v !== "object")
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#71717a;">${k}</td><td style="padding:4px 0;color:#18181b;">${String(
          v
        )}</td></tr>`
    )
    .join("")
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f4f5;padding:24px;"><table width="560" style="background:#fff;border-radius:8px;padding:32px;"><tr><td style="font-size:18px;font-weight:600;color:#18181b;padding-bottom:16px;">${subject}</td></tr><tr><td><table>${rows}</table></td></tr></table></body></html>`
}

/**
 * Build the effective template-param map for a delivery.
 *
 * Convention default (§9.2): every declared variable maps a template parameter
 * named after its `key` to that same `key` — so once an operator sets a
 * template_id whose params are named like our variables, it "just works" with
 * no params_map. `params_map` is consulted only to *override* (remap to a
 * differently-named template parameter), so it merges on top of the convention.
 */
function buildEffectiveParamMap(
  variables: { key: string }[] | undefined,
  paramsMap: Record<string, unknown> | null
): Record<string, string> {
  const effective: Record<string, string> = {}
  for (const v of variables ?? []) {
    effective[v.key] = v.key
  }
  for (const [name, field] of Object.entries(paramsMap ?? {})) {
    effective[name] = String(field)
  }
  return effective
}

const buildMessagesStep = createStep(
  "build-notification-messages",
  async (
    input: {
      event_key: string
      payload: Record<string, unknown>
      deliveries: Delivery[]
    },
    { container }
  ) => {
    const event = getNotificationEvent(input.event_key)
    const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)

    const messages: OutgoingMessage[] = input.deliveries.map((delivery) => {
      const merged = { ...input.payload, ...delivery.data }

      if (delivery.channel === "sms") {
        // sms.ir is template-driven: send the template id + ordered parameters.
        // The convention default fills every declared variable; params_map only
        // remaps to differently-named template parameters.
        const effectiveMap = buildEffectiveParamMap(
          event?.variables,
          delivery.params_map
        )
        // Missing-variable guard (§9.3): never fail-silent. Log + fallback so a
        // partially-rendered template is at least observable.
        const parameters = Object.entries(effectiveMap).map(([name, field]) => {
          const raw = merged[field]
          if (raw === undefined || raw === null) {
            logger.warn(
              `notifications: event=${input.event_key} channel=sms missing var=${field}`
            )
          }
          return { name, value: String(raw ?? "") }
        })
        return {
          to: delivery.to,
          channel: "sms",
          template: input.event_key,
          data: { template_id: delivery.template_id, parameters },
        }
      }

      const subject = delivery.subject ?? event?.label ?? input.event_key
      return {
        to: delivery.to,
        channel: "email",
        template: event?.emailTemplate ?? input.event_key,
        content: { subject, html: buildBasicEmailHtml(subject, merged) },
        data: merged,
      }
    })

    return new StepResponse({ messages })
  }
)

// --- Stage 4/5: route + dispatch via Modules.NOTIFICATION ------------------
const dispatchStep = createStep(
  "dispatch-notifications",
  async (
    input: { messages: OutgoingMessage[]; dedupe_key: string },
    { container }
  ) => {
    if (!input.messages.length) {
      return new StepResponse({ sent: 0 })
    }
    const notificationService = container.resolve<INotificationModuleService>(
      Modules.NOTIFICATION
    )
    await notificationService.createNotifications(
      input.messages.map((message) => ({
        to: message.to,
        channel: message.channel,
        template: message.template,
        data: message.data,
        content: message.content,
        // Idempotency: a duplicate event (same dedupe_key) won't re-send.
        idempotency_key: `${input.dedupe_key}:${message.channel}:${message.to}`,
      }))
    )
    return new StepResponse({ sent: input.messages.length })
  }
)

export const sendNotificationWorkflow = createWorkflow(
  sendNotificationWorkflowId,
  (input: NotificationIntent) => {
    const resolved = resolveRecipientsStep(input)

    const planned = planDeliveriesStep(
      transform({ input, resolved }, ({ input, resolved }) => ({
        event_key: input.event_key,
        recipients: resolved.recipients,
      }))
    )

    const built = buildMessagesStep(
      transform({ input, planned }, ({ input, planned }) => ({
        event_key: input.event_key,
        payload: input.payload,
        deliveries: planned.deliveries,
      }))
    )

    const result = dispatchStep(
      transform({ input, built }, ({ input, built }) => ({
        messages: built.messages,
        dedupe_key: input.dedupe_key,
      }))
    )

    return new WorkflowResponse(result)
  }
)
