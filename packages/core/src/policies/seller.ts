import {
  definePolicies,
  PolicyDefinition,
  toPascalCase,
} from "@medusajs/framework/utils"

// todo: update resoure operations
const resourceOperations: [string, string[]][] = [
  ["seller", ["read", "create", "update", "delete"]],
  ["seller_member", ["read", "create", "update", "delete"]],
  /**
   * Bank details are their own resource, not part of `seller`.
   *
   * `POST /vendor/sellers/:id/payment-details` used to declare
   * `seller:update` — the same policy as the store name and the postal code.
   * That made "can fill in the profile" and "can change where the money goes"
   * literally the same permission, so no role could ever be given one without
   * the other. Splitting the resource is what lets the assisted operator role
   * exist at all.
   */
  ["seller_payment_details", ["read", "update"]],
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

export const sellerPolicies = definePolicies(policies)
