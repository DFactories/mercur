import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { NotificationIntent } from "@mercurjs/types"

import { notificationEventKeys } from "../notification/catalog"
import { sendNotificationWorkflow } from "../workflows/notification/send-notification"

/**
 * The single entry point from domain events into the notification pipeline.
 *
 * It binds to every routable catalog event, normalizes the event into a
 * NotificationIntent, and runs sendNotificationWorkflow. No domain subscriber
 * ever calls the notification module directly.
 */
export default async function notificationOrchestratorHandler({
  event,
  container,
}: SubscriberArgs<Record<string, unknown>>) {
  const payload = (event.data ?? {}) as Record<string, unknown>

  const intent: NotificationIntent = {
    event_key: event.name,
    payload,
    occurred_at: new Date().toISOString(),
    dedupe_key: `${event.name}:${
      (payload.id as string | undefined) ?? JSON.stringify(payload)
    }`,
  }

  // A notification failure (e.g. a missing provider for a channel) must never
  // break the domain operation that emitted the event — log and move on.
  try {
    await sendNotificationWorkflow(container).run({ input: intent })
  } catch (error) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .error(
        `notification-orchestrator: failed to dispatch "${event.name}": ${
          (error as Error)?.message ?? error
        }`
      )
  }
}

export const config: SubscriberConfig = {
  // The catalog is the source of truth for which events are routable.
  event: notificationEventKeys(),
  context: {
    subscriberId: "notification-orchestrator",
  },
}
