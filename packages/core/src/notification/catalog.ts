import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  NotificationAudience,
  NotificationChannel,
  NotificationRecipient,
  NotificationVariableDef,
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
  /**
   * Template variables this event exposes to its channels. Surfaced in the
   * admin settings page and used as the convention-default params_map source
   * (a template parameter named after a variable `key` is auto-filled).
   */
  variables?: NotificationVariableDef[]
  /**
   * Default ON-state for the in-panel feed channels (`feed` / `seller_feed`)
   * when no explicit config row exists. Lets the host curate which operational
   * families surface in the panel by default (admin can still toggle, which
   * writes a row that overrides this). Defaults to `false`. SMS/email always
   * default off regardless.
   */
  defaultFeedEnabled?: boolean
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
    fields: [
      "id",
      "display_id",
      "email",
      "currency_code",
      "total",
      "customer.phone",
      "customer.first_name",
      "items.id",
    ],
    filters: { id },
  })
  const order = data?.[0] as
    | {
        display_id?: number
        email?: string | null
        currency_code?: string | null
        total?: number | null
        items?: Array<{ id: string }>
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
        total: order.total,
        currency: order.currency_code,
        items_count: order.items?.length ?? 0,
      },
    },
  ]
}

async function resolveMemberInvite(
  payload: Record<string, unknown>,
  container: MedusaContainer
): Promise<NotificationRecipient[]> {
  // `member_invite.created` emits an array of { id, token, expires_at }.
  const ids = (
    Array.isArray(payload)
      ? (payload as Array<{ id?: string }>).map((p) => p.id)
      : [(payload as { id?: string }).id]
  ).filter((id): id is string => !!id)
  if (!ids.length) {
    return []
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "member_invite",
    fields: ["id", "phone", "email", "role_id", "seller.name"],
    filters: { id: ids },
  })
  const invites = (data ?? []) as Array<{
    phone?: string | null
    email?: string | null
    role_id?: string | null
    seller?: { name?: string | null }
  }>
  // OTP-native invites are delivered by SMS — only route those with a phone.
  return invites
    .filter((inv) => !!inv.phone)
    .map((inv) => ({
      email: inv.email ?? null,
      phone: inv.phone as string,
      data: { seller_name: inv.seller?.name, role: inv.role_id },
    }))
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
    variables: [
      { key: "first_name", label: "First name", source: "recipient", example: "Sara" },
      { key: "display_id", label: "Order number", source: "recipient", example: "1042" },
      { key: "total", label: "Order total", source: "recipient", example: "1250000" },
      { key: "currency", label: "Currency", source: "recipient", example: "irr" },
      { key: "items_count", label: "Item count", source: "recipient", example: "3" },
    ],
  })

  registerNotificationEvent({
    key: "seller.approved",
    audience: "vendor",
    label: "Seller approved",
    description: "Sent to a seller's team when their store is approved.",
    availableChannels: ["email", "sms", "seller_feed"],
    resolve: resolveSellerMembers,
    emailTemplate: "seller-approved",
    defaultFeedEnabled: true,
    variables: [
      { key: "seller_name", label: "Store name", source: "recipient", example: "Acme Co" },
      { key: "first_name", label: "First name", source: "recipient", example: "Sara" },
    ],
  })

  registerNotificationEvent({
    key: "seller.suspended",
    audience: "vendor",
    label: "Seller suspended",
    description: "Sent to a seller's team when their store is suspended.",
    availableChannels: ["email", "sms", "seller_feed"],
    resolve: resolveSellerMembers,
    emailTemplate: "seller-suspended",
    defaultFeedEnabled: true,
    variables: [
      { key: "seller_name", label: "Store name", source: "recipient", example: "Acme Co" },
      { key: "first_name", label: "First name", source: "recipient", example: "Sara" },
    ],
  })

  registerNotificationEvent({
    key: "member_invite.created",
    audience: "vendor",
    label: "Team member invited",
    description:
      "Sent to an invited phone (OTP-native invite) to join a store's team.",
    availableChannels: ["sms", "seller_feed"],
    resolve: resolveMemberInvite,
    variables: [
      { key: "seller_name", label: "Store name", source: "recipient", example: "Acme Co" },
      { key: "role", label: "Role", source: "recipient", example: "member" },
    ],
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
    // No variables: OTP is delivered directly by the auth path with its own
    // env-configured template + parameter (SMSIR_OTP_TEMPLATE_ID /
    // SMSIR_OTP_PARAM_NAME, default "CODE"); it is never routed/configured here.
  })
}
