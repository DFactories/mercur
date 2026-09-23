export const ProductWorkflowEvents = {
  CREATED: "product.created",
  PUBLISHED: "product.published",
  /** A vendor sent a draft or rejected product in for review. */
  SUBMITTED: "product.submitted",
  REJECTED: "product.rejected",
  CHANGE_REQUESTED: "product.change-requested",
} as const
