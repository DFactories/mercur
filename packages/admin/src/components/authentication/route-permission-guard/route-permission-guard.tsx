import { Outlet, useLocation } from "react-router-dom"

import { permissionForPath, routeAccess } from "../../../lib/nav-permissions"
import { usePermissions } from "../../../providers/permissions-provider"
import { NoAccess } from "../../utilities/no-access"

/**
 * Refuse a route the operator has no permission for, before its page mounts.
 *
 * Pathless, wrapped around the children of both layouts, so it covers routes
 * this package does not know about too — a consuming marketplace's screens
 * arrive through the menu-item system and register their permission with
 * `registerNavPermissions`, which is the same map this reads.
 *
 * Without it the sidebar hid the entry and the URL still worked: the page
 * mounted, its list query 403'd, and a list that throws during render produces
 * the generic error page. Filtering the sidebar alone was never the whole fix.
 */
export const RoutePermissionGuard = () => {
  const { pathname } = useLocation()
  const { hasPermission, isLoading, isUnavailable } = usePermissions()

  const access = routeAccess({
    pathname,
    hasPermission,
    isLoading,
    isUnavailable,
  })

  if (access === "pending") {
    // The layout around this has already painted; a spinner here would flash
    // on the first navigation of every session.
    return <div />
  }

  if (access === "deny") {
    return <NoAccess permission={permissionForPath(pathname)} />
  }

  return <Outlet />
}
