import { useQuery } from "@tanstack/react-query"

import { fetchQuery } from "../../lib/client"

const ASSIGNABLE_ROLES_QUERY_KEY = "rbac-assignable-roles" as const

export type RbacRole = { id: string; name: string; description?: string | null }

/**
 * The roles the signed-in admin is allowed to GRANT.
 *
 * `/assignable`, not `/admin/rbac/roles`, on purpose: the server returns only
 * roles whose policies the actor already holds, which is the no-privilege-
 * escalation rule enforced where it cannot be bypassed. Listing every role and
 * filtering client-side would offer a super-admin role to someone who would
 * then be refused on submit — an invitation to a confusing failure, and a
 * disclosure of roles they have no business knowing exist.
 *
 * `fetchQuery` because this route is `@ignore` in core and absent from the
 * generated route types.
 */
export const useAssignableRoles = () => {
  const { data, ...rest } = useQuery({
    queryKey: [ASSIGNABLE_ROLES_QUERY_KEY],
    queryFn: async () =>
      (await fetchQuery("/admin/rbac/roles/assignable", {
        method: "GET",
      })) as { roles?: RbacRole[]; rbac_roles?: RbacRole[] },
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  // The workflow's payload key has changed shape before; accept either rather
  // than rendering an empty picker that looks like "you may grant nothing".
  const roles = data?.roles ?? data?.rbac_roles ?? []

  return { roles, ...rest }
}
