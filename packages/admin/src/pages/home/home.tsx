import { useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import menuItemsModule from "virtual:mercur/menu-items"

import { useCoreRoutes } from "../../components/layout/main-layout/core-routes"
import { NoAccess } from "../../components/utilities/no-access"
import { firstReachablePath } from "../../lib/nav-permissions"
import { usePermissions } from "../../providers/permissions-provider"
import { getMenuItemsByType } from "../../utils/routes"

/** Build-time constant; read once rather than on every render. */
const customLanding = getMenuItemsByType(menuItemsModule.menuItems ?? [], "main")
  .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
  .map((item) => ({ to: item.path }))

/**
 * Where an operator lands.
 *
 * This redirected to `/orders` unconditionally, which is the screen a
 * restricted admin is most likely to be refused — and the order list throws on
 * its own 403, so signing in showed an error page instead of the panel. The
 * destination is now the first entry of their own sidebar: same list, same
 * order, so they land somewhere the navigation also shows them.
 */
export const Home = () => {
  const navigate = useNavigate()
  const coreRoutes = useCoreRoutes()
  const { hasPermission, isLoading } = usePermissions()

  const destination = useMemo(
    () =>
      isLoading
        ? null
        : firstReachablePath([...coreRoutes, ...customLanding], hasPermission),
    [coreRoutes, hasPermission, isLoading]
  )

  useEffect(() => {
    if (destination) {
      navigate(destination, { replace: true })
    }
  }, [destination, navigate])

  if (!isLoading && !destination) {
    return <NoAccess />
  }

  return <div />
}
