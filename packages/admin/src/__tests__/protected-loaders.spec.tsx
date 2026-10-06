import { createMemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ hasSession: vi.fn() }))
const loaders = vi.hoisted(() => ({
  productDetail: vi.fn(),
  attributeList: vi.fn(),
  taxRegion: vi.fn(),
}))

vi.mock("@components/authentication/protected-route", () => ({
  ProtectedRoute: () => null,
  hasSession: session.hasSession,
}))
vi.mock("@components/authentication/route-permission-guard", () => ({
  RoutePermissionGuard: () => null,
}))
vi.mock("@components/layout/main-layout", () => ({ MainLayout: () => null }))
vi.mock("@components/layout/public-layout", () => ({ PublicLayout: () => null }))
vi.mock("@components/layout/settings-layout", () => ({
  SettingsLayout: () => null,
}))
vi.mock("@components/utilities/error-boundary", () => ({
  ErrorBoundary: () => null,
}))
vi.mock("../pages/tax-regions/tax-region-detail/breadcrumb", () => ({
  TaxRegionDetailBreadcrumb: () => null,
}))
vi.mock("../pages/tax-regions/tax-region-detail/loader", () => ({
  taxRegionLoader: loaders.taxRegion,
}))
vi.mock("../pages/products/product-detail", () => ({
  Breadcrumb: () => null,
  Component: () => null,
  loader: loaders.productDetail,
}))
// Its route is `lazy: () => import(...)`, so the loader arrives as a module
// export rather than a key the route map spells out.
vi.mock("../pages/attributes/attribute-list", () => ({
  Component: () => null,
  loader: loaders.attributeList,
}))
vi.mock("../pages/login", () => ({ Component: () => null }))

import { getRouteMap } from "../get-route-map"

const open = async (
  path: string,
  mainRoutes: Parameters<typeof getRouteMap>[0]["mainRoutes"] = []
) => {
  const router = createMemoryRouter(
    getRouteMap({ settingsRoutes: [], mainRoutes, publicRoutes: [] }),
    { initialEntries: [path] }
  )

  if (!router.state.initialized) {
    await new Promise<void>((resolve) => {
      const unsubscribe = router.subscribe((state) => {
        if (state.initialized) {
          unsubscribe()
          resolve()
        }
      })
    })
  }

  return router
}

afterEach(() => {
  vi.clearAllMocks()
})

/**
 * React Router starts every matched loader at once, so the guard element could
 * not stop them: a deep link opened without a session asked for the page's data
 * first and logged a 401 for each loader before landing on /login.
 */
describe("loaders behind ProtectedRoute", () => {
  const routes = [
    ["/products/prod_1", loaders.productDetail],
    ["/settings/attributes", loaders.attributeList],
    ["/settings/tax-regions/txreg_1", loaders.taxRegion],
  ] as const

  it.each(routes)("%s asks for nothing without a session", async (path, loader) => {
    session.hasSession.mockResolvedValue(false)

    await open(path)

    expect(session.hasSession).toHaveBeenCalled()
    expect(loader).not.toHaveBeenCalled()
    // The guard's check and the page's share one navigation, which is what
    // lets them share one answer.
    const signals = session.hasSession.mock.calls.map(
      ([args]) => args.request.signal
    )
    expect(signals.length).toBeGreaterThan(1)
    expect(new Set(signals).size).toBe(1)
  })

  it.each(routes)("%s loads its data with a session", async (path, loader) => {
    session.hasSession.mockResolvedValue(true)
    loader.mockResolvedValue({ ok: true })

    const router = await open(path)

    expect(loader).toHaveBeenCalledTimes(1)
    expect(Object.values(router.state.loaderData)).toContainEqual({ ok: true })
  })

  it("holds back a host extension's loader too", async () => {
    session.hasSession.mockResolvedValue(false)
    const extensionLoader = vi.fn()

    await open("/requests", [
      { path: "/requests", Component: () => null, loader: extensionLoader },
    ])

    expect(extensionLoader).not.toHaveBeenCalled()
  })

  it("the login page does not probe the session", async () => {
    await open("/login")

    expect(session.hasSession).not.toHaveBeenCalled()
  })
})
