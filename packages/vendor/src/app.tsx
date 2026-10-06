import { customRoutes } from "virtual:mercur/routes";
import widgets from "virtual:mercur/widgets";
import navigation from "virtual:mercur/navigation";
import customFields from "virtual:mercur/custom-fields";
import { HelmetProvider } from "react-helmet-async";
import { QueryClientProvider } from "@tanstack/react-query";
import { ExtensionProvider } from "@mercurjs/dashboard-shared";
import { DirectionProvider, ThemeProvider } from "./providers";
import { I18nProvider, Toaster, TooltipProvider } from "@medusajs/ui";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { I18n } from "./components/utilities/i18n";
import { getRouteMap } from "./get-route-map";
import { createRouteMap, getRoutesByType } from "./utils/routes";
import { queryClient } from "./lib/query-client";

let router: ReturnType<typeof createBrowserRouter> | undefined;

/**
 * Built once. `createBrowserRouter` starts the router it returns — a history
 * listener, and the loaders for the current URL — so calling it in render
 * started a second router whenever `App` rendered again: StrictMode's double
 * render ran every loader on the page twice, and the discarded router went on
 * answering back/forward with loaders of its own.
 */
const getRouter = () => {
  router ??= createBrowserRouter(
    getRouteMap({
      settingsRoutes: createRouteMap(getRoutesByType(customRoutes, "settings")),
      mainRoutes: createRouteMap(getRoutesByType(customRoutes, "main")),
      publicRoutes: createRouteMap(getRoutesByType(customRoutes, "public")),
    }),
    { basename: __BASE__ },
  );

  return router;
};

export default function App() {
  return (
    <TooltipProvider>
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <ExtensionProvider
              widgets={widgets}
              navigation={navigation}
              customFields={customFields}
            >
              <I18n />
              <DirectionProvider>
                <I18nProvider>
                  <RouterProvider router={getRouter()} />
                </I18nProvider>
                <Toaster />
              </DirectionProvider>
            </ExtensionProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </HelmetProvider>
    </TooltipProvider>
  );
}
