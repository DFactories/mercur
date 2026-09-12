import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { SellerStatus } from "@mercurjs/types"

import {
  iranMobileVariants,
  isIranMobile,
  normalizeIranPhone,
} from "./phone"

/**
 * The filter that answers "which producers is the store allowed to show right
 * now?" — open, and not inside a scheduled closure.
 *
 * A closure is the window `[closed_from, closed_to]`, so a seller is hidden
 * only WHILE that window contains `now`. Everything else — no window, a window
 * that has not started, a window that has finished — is a producer who is
 * trading normally.
 *
 * The previous shape ANDed two conditions:
 *
 *   (closed_from IS NULL OR closed_from > now) AND (closed_to IS NULL OR closed_to < now)
 *
 * which, once both dates are set, demands that the closure starts in the future
 * AND ended in the past. `closed_to` is always after `closed_from`, so that is
 * unsatisfiable: saving ANY window — past, present or future — removed the
 * producer from the storefront permanently. Live, a producer scheduled a
 * holiday three weeks out and their entire catalogue disappeared the moment
 * they hit save, while the search index (which gated on `status` alone) kept
 * counting the products — a shopper saw «۴ محصول» above an empty grid.
 *
 * Exported as one filter rather than inlined, because the same predicate is
 * needed by `/store/sellers` as well and the duplicated copy is precisely what
 * let the two drift.
 */
export const sellerVisibilityFilters = (now: Date = new Date()) => ({
  status: SellerStatus.OPEN,
  $or: [
    // never scheduled a closure
    { closed_from: null },
    // scheduled one, but it has not begun
    { closed_from: { $gt: now } },
    // it began and has already finished (an open-ended closure has no
    // `closed_to`, matches nothing here, and so stays hidden — correctly)
    { closed_to: { $lt: now } },
  ],
})

export const resolveVisibleSellerIds = async (
  scope: MedusaContainer
): Promise<string[]> => {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: visibleSellers } = await query.graph({
    entity: "seller",
    fields: ["id"],
    filters: sellerVisibilityFilters(),
  })

  return visibleSellers.map((s: { id: string }) => s.id)
}

/**
 * A store phone that changed has not been verified — whatever the old one had
 * proven. Returns the update body with `phone_verified_at: null` added when the
 * incoming phone differs from the stored one.
 *
 * Every writer of `seller.phone` has to do this, which is why it is one
 * function: the rule reached the vendor's `/vendor/sellers/:id` route and was
 * missing from both `/vendor/sellers/me` and the operator's
 * `/admin/sellers/:id`, so a store could change its number through either of
 * those and keep a verification badge earned by a number it no longer answers.
 */
export const withPhoneVerificationReset = async <
  T extends { phone?: string | null },
>(
  scope: MedusaContainer,
  sellerId: string,
  update: T
): Promise<T & { phone_verified_at?: Date | null }> => {
  if (update.phone === undefined) {
    return update
  }

  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [current],
  } = await query.graph({
    entity: "seller",
    fields: ["phone"],
    filters: { id: sellerId },
  })

  const currentPhone = (current?.phone as string | null) ?? null
  const nextPhone = update.phone ?? null
  const unchanged =
    currentPhone !== null &&
    nextPhone !== null &&
    normalizeIranPhone(currentPhone) === normalizeIranPhone(nextPhone)

  if (unchanged) {
    return update
  }

  return { ...update, phone_verified_at: null }
}

/**
 * A phone number typed into the stores search finds the store it belongs to —
 * whether it is the store's own contact number or the SIGN-IN number of someone
 * on its team.
 *
 * Medusa's free-text `q` searches the seller's own columns, so the owner's
 * number matched nothing: an operator holding the number a producer calls from
 * had no way to reach their store. Returns the seller ids to filter by, or null
 * when the query is not a phone number at all (leave `q` alone then).
 */
export const resolveSellerIdsByPhone = async (
  scope: MedusaContainer,
  q: string
): Promise<string[] | null> => {
  if (!isIranMobile(q)) {
    return null
  }

  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const variants = iranMobileVariants(q)

  const { data: sellersByPhone } = await query.graph({
    entity: "seller",
    fields: ["id"],
    filters: { phone: variants },
  })

  const { data: members } = await query.graph({
    entity: "member",
    fields: ["id"],
    filters: { phone: variants },
  })

  const ids = new Set((sellersByPhone ?? []).map((s: { id: string }) => s.id))

  const memberIds = (members ?? []).map((m: { id: string }) => m.id)
  if (memberIds.length) {
    const { data: seats } = await query.graph({
      entity: "seller_member",
      fields: ["seller_id"],
      filters: { member_id: memberIds },
    })
    for (const seat of (seats ?? []) as Array<{ seller_id: string }>) {
      ids.add(seat.seller_id)
    }
  }

  return Array.from(ids)
}
