import { IRbacModuleService, RbacRoleDTO } from "@medusajs/types"
import { SellerRole } from "@mercurjs/types"

type SellerRoleDefinition = {
  id: SellerRole
  name: string
  description: string
  policyKeys: "*" | string[]
}

export const SELLER_ROLES: SellerRoleDefinition[] = [
  {
    id: SellerRole.SELLER_ADMINISTRATION,
    name: "Seller Administration",
    description:
      "Full access to all seller account features and settings",
    policyKeys: "*",
  },
  {
    id: SellerRole.INVENTORY_MANAGEMENT,
    name: "Inventory Management",
    description: "Manage offers and catalog",
    policyKeys: [],
  },
  {
    id: SellerRole.ORDER_MANAGEMENT,
    name: "Order Management",
    description: "View and process orders",
    policyKeys: [],
  },
  {
    id: SellerRole.ACCOUNTING,
    name: "Accounting",
    description: "View billing and manage payment information",
    /**
     * Reading the bank details is what this role is for — its description
     * says so — and it became a grant that had to be held the moment the
     * seller routes stopped handing `payment_details` to every member.
     *
     * Read only. Changing where the money goes stays with the owner and
     * Seller Administration; widening that is a decision, not a consequence
     * of closing a read.
     */
    policyKeys: ["seller_payment_details:read"],
  },
  {
    id: SellerRole.SUPPORT,
    name: "Support",
    description: "Handle customer messages and view orders",
    policyKeys: [],
  },
  {
    /**
     * Assisted onboarding: an internal operator filling a store in for the
     * producer who owns it.
     *
     * The list is explicit rather than `"*"` on purpose. It grants the store
     * profile — name, description, address, company details — because filling
     * that in IS the job, and read access to the team so the operator can see
     * whose store they are in. It withholds the three things that belong to
     * the producer alone:
     *
     *   seller_payment_details:update  the IBAN. Money.
     *   seller_member:create/update/delete  who else gets in.
     *   (publication)  guarded separately, by the readiness workflow's
     *                  `required_roles`, which this role is absent from.
     *
     * Catalogue work — products, offers, prices, stock locations, shipping —
     * needs nothing here, because none of those routes declare a policy at
     * all. That is a real gap (they fail open for every role), but it is the
     * pre-existing one; this role neither widens nor depends on it.
     */
    id: SellerRole.ASSISTED_OPERATOR,
    name: "Assisted Onboarding Operator",
    description:
      "Internal operator setting a store up for its producer: profile and catalogue, but no bank details, no team changes and no publishing",
    policyKeys: [
      "seller:read",
      "seller:update",
      "seller_member:read",
    ],
  },
]

export async function ensureSellerDefaultRoles(
  rbacService: IRbacModuleService
): Promise<RbacRoleDTO[]> {
  const roleIds = SELLER_ROLES.map((role) => role.id)

  const existingRoles = await rbacService.listRbacRoles({ id: roleIds })
  const roleById = new Map(existingRoles.map((role) => [role.id, role]))

  const missingRoles = SELLER_ROLES.filter((role) => !roleById.has(role.id))

  if (missingRoles.length) {
    const createdRoles = await rbacService.createRbacRoles(
      missingRoles.map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description,
      }))
    )

    createdRoles.forEach((role) => {
      roleById.set(role.id, role)
    })
  }

  const policies = await rbacService.listRbacPolicies({})
  const existingRolePolicies = await rbacService.listRbacRolePolicies({
    role_id: roleIds,
  })

  const policyByKey = new Map(policies.map((policy) => [policy.key, policy]))
  const existingBindings = new Set(
    existingRolePolicies.map(
      (rolePolicy) => `${rolePolicy.role_id}:${rolePolicy.policy_id}`
    )
  )

  const rolePoliciesToCreate: { role_id: string; policy_id: string }[] = []

  for (const roleDefinition of SELLER_ROLES) {
    const role = roleById.get(roleDefinition.id)

    if (!role) {
      continue
    }

    const targetPolicies =
      roleDefinition.policyKeys === "*"
        ? policies
        : roleDefinition.policyKeys
            .map((key) => policyByKey.get(key))
            .filter((policy): policy is NonNullable<typeof policy> => !!policy)

    for (const policy of targetPolicies) {
      const bindingKey = `${role.id}:${policy.id}`

      if (existingBindings.has(bindingKey)) {
        continue
      }

      existingBindings.add(bindingKey)
      rolePoliciesToCreate.push({
        role_id: role.id,
        policy_id: policy.id,
      })
    }
  }

  if (rolePoliciesToCreate.length) {
    await rbacService.createRbacRolePolicies(rolePoliciesToCreate)
  }

  return SELLER_ROLES.map((role) => roleById.get(role.id)).filter(
    (role): role is RbacRoleDTO => !!role
  )
}
