import type { PermissionChecks } from "./types"

/**
 * The whole decision, as a pure function.
 *
 * In its OWN module, with no import of the hook or the client: those reach
 * `lib/client`, which reads `virtual:mercur/config`, and a test that touches it
 * dies with "Only URLs with a scheme in: file, data, and node are supported".
 * Splitting the decision out is what lets it be tested against realistic nav
 * trees without a DOM, a router, or the dashboard vite plugin. This package's tests are all pure-logic ones; pulling in
 * @testing-library and jsdom to assert a sidebar filter would be a dependency
 * on a PUBLISHED package for a courtesy layer. Testing the real function the
 * provider calls is the honest version of the same check.
 */
export function buildPermissionChecks(state: {
  permissions: string[]
  isLoading: boolean
  isError: boolean
}): PermissionChecks {
  const granted = new Set(state.permissions)

  /**
   * Fail OPEN, on purpose, and only here.
   *
   * While the list is loading or the request failed, every check passes and the
   * full sidebar renders. That is the opposite of the server's rule, and it is
   * right for this layer: hiding is a courtesy, so a failure should cost the
   * operator a 403 they can read, not a panel that looks empty and makes them
   * think their access was revoked. The route still refuses them either way.
   */
  const unavailable = state.isLoading || state.isError

  const hasPermission = (permission: string) =>
    unavailable || granted.has(permission)

  return {
    hasPermission,
    hasAnyPermission: (list: string[]) =>
      unavailable || list.some((p) => granted.has(p)),
  }
}
