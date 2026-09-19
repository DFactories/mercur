import { createContext, PropsWithChildren, useContext, useMemo } from "react"

import { useMyPermissions } from "../../hooks/api/permissions"

/**
 * Panel-side permission checks.
 *
 * ## Why this is not `@medusajs/dashboard`'s
 *
 * The dashboard package does contain a `PermissionsProvider`, and it is not
 * reachable: it lives in an internal chunk that `app.mjs` and `components.mjs`
 * import for other reasons but do not re-export, no `.d.ts` declares it, and
 * the chunk filename is content-hashed so it changes on every build. Importing
 * it would be a dependency on a private path. The logic is forty lines; owning
 * it is cheaper than pinning a hash.
 *
 * ## What it deliberately does not do
 *
 * It does not decide anything. Every permission it reports was computed by the
 * server, and every screen it hides is also refused by the server. If this
 * provider is wrong the operator sees a tidy panel and gets a 403, which is a
 * usability bug. If the route declarations are wrong, someone approves a payout
 * they should not. Only one of those is this file's problem.
 */
type PermissionsContextValue = {
  /** Literal `resource:operation` grants, wildcards already expanded. */
  permissions: string[]
  isLoading: boolean
  /** Did the fetch fail? Then nothing is hidden — see the note in the provider. */
  isUnavailable: boolean
  hasPermission: (permission: string) => boolean
  hasAnyPermission: (permissions: string[]) => boolean
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null)

export const PermissionsProvider = ({ children }: PropsWithChildren) => {
  const { permissions, isLoading, isError } = useMyPermissions()

  const value = useMemo<PermissionsContextValue>(() => {
    const granted = new Set(permissions)

    /**
     * Fail OPEN, on purpose, and only here.
     *
     * While the list is loading or the request failed, every check passes and
     * the full sidebar renders. That is the opposite of the server's rule, and
     * it is right for this layer: hiding is a courtesy, so a failure should
     * cost the operator a 403 they can read, not a panel that looks empty and
     * makes them think their access was revoked. The route still refuses them.
     */
    const unavailable = isLoading || isError

    const hasPermission = (permission: string) =>
      unavailable || granted.has(permission)

    return {
      permissions,
      isLoading,
      isUnavailable: !!isError,
      hasPermission,
      hasAnyPermission: (list: string[]) =>
        unavailable || list.some((p) => granted.has(p)),
    }
  }, [permissions, isLoading, isError])

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  )
}

/**
 * Outside a provider this returns permissive defaults rather than throwing.
 *
 * A thrown error here would blank the whole panel over a sidebar filter, and
 * the panel must render for someone whose permissions could not be loaded.
 */
export const usePermissions = (): PermissionsContextValue => {
  const context = useContext(PermissionsContext)

  if (!context) {
    return {
      permissions: [],
      isLoading: false,
      isUnavailable: true,
      hasPermission: () => true,
      hasAnyPermission: () => true,
    }
  }

  return context
}
