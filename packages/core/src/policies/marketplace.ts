import {
  definePolicies,
  PolicyDefinition,
  toPascalCase,
} from "@medusajs/framework/utils"

/**
 * RBAC policy resources for the marketplace-specific admin surfaces this
 * package owns.
 *
 * ## Why these and not the rest
 *
 * Most of `api/admin/**` here re-exposes a resource Medusa already registers:
 * `orders` -> `order`, `products` -> `product`, `collections` ->
 * `product_collection`, `reservations` -> `reservation_item`, and so on. Those
 * need no definition, only a declaration, which is release 2's job.
 *
 * `/admin/members` is the one that looks like it needs a new resource and does
 * not: it queries `entity: "member"`, the seller-member model, so it belongs to
 * `seller_member` in ./seller.ts. Inventing a `member` resource would produce a
 * key that binds to nothing — the exact failure this file exists to avoid.
 *
 * What is left is the set below: things that exist only in this marketplace and
 * that no core policy covers.
 *
 * ## `definePolicies` and the database
 *
 * The call registers the resource in an in-memory registry. `RbacModuleService`
 * mirrors that registry into `rbac_policy` on its `onApplicationStart` hook, and
 * — worth knowing before adding or removing anything here — that same hook
 * SOFT-DELETES any `rbac_policy` row whose key is no longer registered. Deleting
 * a resource from this file therefore revokes it from every role that held it,
 * on the next boot, without further warning.
 *
 * Every resource gets all four operations, matching ./seller.ts and the 58 core
 * resources. An operation that exists and is never declared costs nothing; one
 * that has to be added later is a migration of every role that should have had it.
 */
const resourceOperations: [string, string[]][] = [
  /**
   * The commission a seller is charged. Money, and the reason the split from
   * `seller` matters: whoever may edit a store's name must not thereby be able
   * to change what it is charged.
   */
  ["commission_rate", ["read", "create", "update", "delete"]],
  /** A payout record. Distinct from the request that produced it. */
  ["payout", ["read", "create", "update", "delete"]],
  /** Seller offers — the price, stock and tier ladder a buyer actually sees. */
  ["offer", ["read", "create", "update", "delete"]],
  /** Buyer reviews of a seller or product, and their moderation. */
  ["review", ["read", "create", "update", "delete"]],
  /** Order groups — the split of one basket across several sellers. */
  ["order_group", ["read", "create", "update", "delete"]],
  /** The attribute taxonomy products are described with. */
  ["product_attribute", ["read", "create", "update", "delete"]],
  /** A seller's pending change to a published product, and its approval. */
  ["product_change", ["read", "create", "update", "delete"]],
  /** Reusable shipping templates offered to sellers. */
  ["shipping_template", ["read", "create", "update", "delete"]],
  /** Per-seller notification settings. */
  ["notification_setting", ["read", "create", "update", "delete"]],
]

const policies: PolicyDefinition[] = []

for (const [resource, operations] of resourceOperations) {
  for (const operation of operations) {
    policies.push({
      name: toPascalCase(operation) + toPascalCase(resource),
      resource,
      operation,
      description: `${toPascalCase(operation)} ${resource.replace(/_/g, " ")}`,
    })
  }
}

/** Exported so a consumer's sweep test can assert against the source of truth. */
export const MARKETPLACE_POLICY_RESOURCES = resourceOperations.map(
  ([resource]) => resource
)

export const marketplacePolicies = definePolicies(policies)
