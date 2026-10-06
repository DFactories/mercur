import { ReactNode } from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

const { createBrowserRouter, passthrough } = vi.hoisted(() => ({
  createBrowserRouter: vi.fn(() => ({})),
  passthrough: ({ children }: { children?: ReactNode }) => children,
}))

vi.mock("react-router-dom", () => ({
  createBrowserRouter,
  RouterProvider: () => null,
}))
vi.mock("virtual:mercur/routes", () => ({ customRoutes: [] }))
vi.mock("virtual:mercur/widgets", () => ({ default: [] }))
vi.mock("virtual:mercur/navigation", () => ({ default: [] }))
vi.mock("virtual:mercur/custom-fields", () => ({ default: {} }))
vi.mock("react-helmet-async", () => ({ HelmetProvider: passthrough }))
vi.mock("@mercurjs/dashboard-shared", () => ({ ExtensionProvider: passthrough }))
vi.mock("@medusajs/ui", () => ({
  I18nProvider: passthrough,
  Toaster: () => null,
  TooltipProvider: passthrough,
}))
vi.mock("../providers", () => ({
  DirectionProvider: passthrough,
  ThemeProvider: passthrough,
}))
vi.mock("../components/utilities/i18n", () => ({ I18n: () => null }))
vi.mock("../get-route-map", () => ({ getRouteMap: () => [] }))
vi.mock("../utils/routes", () => ({
  createRouteMap: () => [],
  getRoutesByType: () => [],
}))

vi.stubGlobal("__BASE__", "/")

import App from "../app"

describe("App", () => {
  /**
   * `createBrowserRouter` starts the router it returns, loaders included, so
   * StrictMode's second render of `App` ran every loader on the page twice.
   */
  it("starts one router however often it renders", () => {
    renderToString(<App />)
    renderToString(<App />)

    expect(createBrowserRouter).toHaveBeenCalledTimes(1)
  })
})
