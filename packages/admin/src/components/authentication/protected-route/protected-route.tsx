import { Spinner } from "@medusajs/icons";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useMe } from "../../../hooks/api/users";
import { PermissionsProvider } from "../../../providers/permissions-provider";
import { SearchProvider } from "../../../providers/search-provider";
import { SidebarProvider } from "../../../providers/sidebar-provider";

export const ProtectedRoute = () => {
  const { user, isLoading } = useMe();
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
