import { createMemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ hasSession: vi.fn() }))
const loaders = vi.hoisted(() => ({
  productList: vi.fn(),
  productDetail: vi.fn(),
  variant: vi.fn(),
  onboarding: vi.fn(),
}))

vi.mock("../components/authentication/protected-route", () => ({
  ProtectedRoute: () => null,
  hasSession: session.hasSession,
}))
vi.mock("../components/layout/main-layout", () => ({ MainLayout: () => null }))
vi.mock("../components/layout/public-layout", () => ({ PublicLayout: () => null }))
vi.mock("../components/layout/settings-layout", () => ({
  SettingsLayout: () => null,
}))
vi.mock("../components/utilities/error-boundary", () => ({
  ErrorBoundary: () => null,
}))
vi.mock("../pages/products", () => ({
  ProductListPage: () => null,
  productListLoader: loaders.productList,
}))
vi.mock("../pages/products/[id]", () => ({
  ProductDetailPage: () => null,
  loader: loaders.productDetail,
}))
vi.mock("../pages/products/[id]/breadcrumb", () => ({ Breadcrumb: () => null }))
// Its index route is `lazy: () => import(...)`, so the loader arrives as a
// module export rather than a key the route map spells out.
vi.mock("../pages/product-variants/product-variant-detail", () => ({
  Component: () => null,
  Breadcrumb: () => null,
  loader: loaders.variant,
}))
vi.mock("../pages/onboarding", () => ({
  Component: () => null,
  loader: loaders.onboarding,
}))
vi.mock("../pages/login", () => ({ LoginPage: () => null }))

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
  describe("without a session", () => {
    it.each([
      ["/products", loaders.productList],
      ["/products/prod_1", loaders.productDetail],
      ["/products/prod_1/variants/variant_1", loaders.variant],
    ])("%s asks for nothing", async (path, loader) => {
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

    it("holds back a host extension's loader too", async () => {
      session.hasSession.mockResolvedValue(false)
      const extensionLoader = vi.fn()

      await open("/requests", [
        { path: "/requests", Component: () => null, loader: extensionLoader },
      ])

      expect(extensionLoader).not.toHaveBeenCalled()
    })
  })

  describe("with a session", () => {
    it.each([
      ["/products", loaders.productList],
      ["/products/prod_1", loaders.productDetail],
      ["/products/prod_1/variants/variant_1", loaders.variant],
    ])("%s loads its data", async (path, loader) => {
      session.hasSession.mockResolvedValue(true)
      loader.mockResolvedValue({ ok: true })

      const router = await open(path)

      expect(loader).toHaveBeenCalled()
      expect(Object.values(router.state.loaderData)).toContainEqual({
        ok: true,
      })
    })

    it("hands the loader its route params", async () => {
      session.hasSession.mockResolvedValue(true)
      loaders.productDetail.mockResolvedValue(null)

      await open("/products/prod_1")

      expect(loaders.productDetail.mock.calls[0][0].params).toEqual({
        id: "prod_1",
      })
    })
  })

  describe("public routes", () => {
    it("the login page does not probe the session", async () => {
      await open("/login")

      expect(session.hasSession).not.toHaveBeenCalled()
    })

    it("onboarding keeps its own loader", async () => {
      loaders.onboarding.mockResolvedValue(null)

      await open("/onboarding")

      expect(loaders.onboarding).toHaveBeenCalledTimes(1)
      expect(session.hasSession).not.toHaveBeenCalled()
    })
  })
})
