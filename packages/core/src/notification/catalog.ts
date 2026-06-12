import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  NotificationAudience,
  NotificationChannel,
  NotificationRecipient,
} from "@mercurjs/types"

/**
 * Hybrid notification-event catalog.
 *
 * The static half (this registry) is the immutable contract of each event:
 * its key, audience, available channels, recipient resolver, and default email
 * template. Modules and blocks can extend it at boot via
 * {@link registerNotificationEvent}. The mutable half (enabled channels +
 * approved sms.ir template ids) lives in the `notification-settings` module's
 * DB table; the two are merged on read to form the "effective catalog".
 */
export interface NotificationEventDef {
  key: string
  audience: NotificationAudience
  label: string
  description?: string
  availableChannels: NotificationChannel[]
  /**
   * Resolve the (possibly multiple) recipients for an occurrence of this event.
   * Omitted for system events (e.g. OTP) which are never routed by the pipeline.
   */
  resolve?: (
    payload: Record<string, unknown>,
    container: MedusaContainer
  ) => Promise<NotificationRecipient[]>
  /** Email template reference rendered locally by the pipeline. */
  emailTemplate?: string
  /** System events are shown read-only in admin and never routed (e.g. OTP). */
  system?: boolean
}

const registry = new Map<string, NotificationEventDef>()

let defaultsRegistered = false

export function registerNotificationEvent(def: NotificationEventDef): void {
  registry.set(def.key, def)
}

export function getNotificationEvent(key: string): NotificationEventDef | undefined {
  ensureDefaults()
  return registry.get(key)
}

export function listNotificationEvents(): NotificationEventDef[] {
  ensureDefaults()
  return Array.from(registry.values())
}

/** Routable (non-system) event keys — what the orchestrator subscriber binds to. */
export function notificationEventKeys(): string[] {
  return listNotificationEvents()
    .filter((e) => !e.system)
    .map((e) => e.key)
}

function ensureDefaults(): void {
  if (defaultsRegistered) {
    return
  }
  defaultsRegistered = true
  registerDefaultNotificationEvents()
}

// ---------------------------------------------------------------------------
// Default recipient resolvers
// ---------------------------------------------------------------------------

async function resolveSellerMembers(
  payload: Record<string, unknown>,
  container: MedusaContainer
): Promise<NotificationRecipient[]> {
  const id = payload.id as string | undefined
  if (!id) {
    return []
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "seller",
    fields: ["id", "name", "members.email", "members.phone", "members.first_name"],
    filters: { id },
  })
  const seller = data?.[0] as
    | {
        name?: string
        members?: Array<{
          email?: string | null
          phone?: string | null
          first_name?: string | null
        }>
      }
    | undefined
  if (!seller?.members?.length) {
    return []
  }
  return seller.members.map((m) => ({
    email: m.email ?? null,
    phone: m.phone ?? null,
    data: { seller_name: seller.name, first_name: m.first_name },
  }))
}

async function resolveOrderCustomer(
  payload: Record<string, unknown>,
  container: MedusaContainer
): Promise<NotificationRecipient[]> {
  const id = payload.id as string | undefined
  if (!id) {
    return []
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "display_id", "email", "customer.phone", "customer.first_name"],
    filters: { id },
  })
  const order = data?.[0] as
    | {
        display_id?: number
        email?: string | null
        customer?: { phone?: string | null; first_name?: string | null }
      }
    | undefined
  if (!order) {
    return []
  }
  return [
    {
      email: order.email ?? null,
      phone: order.customer?.phone ?? null,
      data: {
        display_id: order.display_id,
        first_name: order.customer?.first_name,
      },
    },
  ]
}

// ---------------------------------------------------------------------------
// Default seed events
// ---------------------------------------------------------------------------

function registerDefaultNotificationEvents(): void {
  registerNotificationEvent({
    key: "order.placed",
    audience: "customer",
    label: "Order placed",
    description: "Sent to the customer when their order is placed.",
    availableChannels: ["email", "sms"],
    resolve: resolveOrderCustomer,
    emailTemplate: "order-placed",
  })

  registerNotificationEvent({
    key: "seller.approved",
    audience: "vendor",
    label: "Seller approved",
    description: "Sent to a seller's team when their store is approved.",
    availableChannels: ["email", "sms", "feed"],
    resolve: resolveSellerMembers,
    emailTemplate: "seller-approved",
  })

  registerNotificationEvent({
    key: "seller.suspended",
    audience: "vendor",
    label: "Seller suspended",
    description: "Sent to a seller's team when their store is suspended.",
    availableChannels: ["email", "sms", "feed"],
    resolve: resolveSellerMembers,
    emailTemplate: "seller-suspended",
  })

  // Read-only system row: OTP is delivered directly by the auth path and is
  // never routed through this pipeline or configurable here.
  registerNotificationEvent({
    key: "auth.otp",
    audience: "customer",
    label: "Login code (OTP)",
    description:
      "One-time login code. Always delivered by SMS through the auth flow; not configurable.",
    availableChannels: ["sms"],
    system: true,
  })
}
