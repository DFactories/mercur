import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { SellerStatus } from "@mercurjs/types"

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
