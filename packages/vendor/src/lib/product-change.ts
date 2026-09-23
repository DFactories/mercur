/**
 * What a product edit's response says happened, and the one refusal the panel
 * has to recognise.
 *
 * Whether an edit waits for an operator is decided by the server per product
 * — a product that is not published yet is edited directly, a published one
 * is queued — so the panel reads the answer instead of guessing from the
 * PRODUCT_REQUEST flag. Guessing told a producer editing a draft "your request
 * awaits approval" for a change that was already live.
 */

type ProductChangeResponseLike =
  | { product_change?: { status?: string | null } | null }
  | null
  | undefined

/** True when the edit was queued for an operator rather than applied. */
export const isQueuedForReview = (response: ProductChangeResponseLike) =>
  response?.product_change?.status === "pending"

/** Statuses a producer may send in for review: never submitted, or sent back. */
export const canSubmitForReview = (status?: string | null) =>
  status === "draft" || status === "rejected"

/**
 * The backend's refusal while a published product already has a request
 * awaiting review. Must match `PENDING_PRODUCT_CHANGE_ERROR_MESSAGE` in
 * `@mercurjs/core` (product-edit/steps/validate-no-pending-product-change).
 */
export const PENDING_PRODUCT_CHANGE_ERROR_MESSAGE =
  "There is already an active update request for this product. Only one request can be active at a time."

/** Translation key the API error translator maps that refusal to. */
export const PENDING_PRODUCT_CHANGE_ERROR_KEY = "products.edits.errors.pendingRequest"
