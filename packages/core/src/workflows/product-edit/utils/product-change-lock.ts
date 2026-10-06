/**
 * Held while actions are added to a request and while a request is confirmed,
 * so an edit can never land in a request after its actions were applied.
 */
export const productChangeLockKey = (changeId: string) =>
  `product-change:${changeId}`
