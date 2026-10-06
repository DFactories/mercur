import { Spinner } from "@medusajs/icons";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useMe } from "../../../hooks/api/users";
import { PermissionsProvider } from "../../../providers/permissions-provider";
import { SearchProvider } from "../../../providers/search-provider";
import { SidebarProvider } from "../../../providers/sidebar-provider";

export const ProtectedRoute = () => {
  /**
   * The route's loader has already asked, and every loader below waited for
   * the answer. A failure is that answer; refetching it on mount was the
   * second 401 a signed-out deep link logged.
   */
  const { user, isLoading } = useMe(undefined, { retryOnMount: false });
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="text-ui-fg-interactive animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    // Inside the `user` guard above on purpose: the permissions request is
    // authenticated, so firing it before we know there is a session would 401
    // on every visit to the login page.
    <PermissionsProvider>
      <SidebarProvider>
        <SearchProvider>
          <Outlet />
        </SearchProvider>
      </SidebarProvider>
    </PermissionsProvider>
  );
};
