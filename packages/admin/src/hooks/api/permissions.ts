import { useQuery } from "@tanstack/react-query"

import { fetchQuery } from "../../lib/client"

const PERMISSIONS_QUERY_KEY = "rbac-me-permissions" as const

export type MyPermissions = { permissions: string[] }

/**
 * The signed-in admin's effective permissions: a flat `resource:operation`
 * list with wildcards already expanded by the server.
 *
 * `fetchQuery` rather than a typed client method: `/admin/rbac/me/permissions`
 * is marked `@ignore` in core, so it never reaches the generated route types
 * and `sdk` has no entry for it. This is the same escape hatch
 * `hooks/api/notification.tsx` uses for `/admin/notification-read-state`.
 *
 * ## Letting the server expand wildcards is the point
 *
 * A super admin holds one policy row, `*:*`. Expanding that into "every
 * resource and operation that exists" needs the policy registry, which lives on
 * the server. This endpoint does it and hands back literals, so the panel can
 * do plain set membership and never carries a second implementation of
 * wildcard semantics that could disagree with the one enforcing requests.
 *
 * ## It reads the DATABASE; enforcement reads the SESSION
 *
 * This re-queries the actor's roles. `wrapWithPoliciesCheck` instead reads
 * `auth_context.app_metadata.roles`, which both panels snapshot into the
 * express session at login and never refresh. So after a role change the two
 * disagree, in the worst direction: the sidebar renders from fresh data and
 * looks correct while every guarded route 403s from stale data. The provider
 * surfaces that rather than leaving the operator to guess.
 */
export const useMyPermissions = () => {
  const { data, ...rest } = useQuery({
    queryKey: [PERMISSIONS_QUERY_KEY],
    queryFn: async () =>
      (await fetchQuery("/admin/rbac/me/permissions", {
        method: "GET",
      })) as MyPermissions,
    // Permissions change when somebody edits a role — rare, and never urgent
    // enough to refetch on every window focus.
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  return { permissions: data?.permissions ?? [], ...rest }
}
