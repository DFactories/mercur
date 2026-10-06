import type {
  LoaderFunction,
  LoaderFunctionArgs,
  RouteObject,
} from "react-router-dom"

/**
 * React Router starts every matched loader the moment a navigation begins, in
 * parallel with rendering, so a guard element above them cannot stop a page
 * from asking for its data. A deep link opened without a session fired one
 * 401 per loader before the guard got to redirect.
 *
 * Every loader under `routes` — a static one, or one a `lazy` route delivers,
 * including extension routes this package cannot name — now waits for
 * `hasSession` and is skipped when it answers false. The page never renders
 * in that case, because the guard redirects first.
 */
export function requireSession(
  routes: RouteObject[],
  hasSession: (args: LoaderFunctionArgs) => Promise<boolean>
): RouteObject[] {
  const gate =
    (loader: LoaderFunction): LoaderFunction =>
    async (...args) =>
      (await hasSession(args[0])) ? loader(...args) : null

  const withGatedLoader = <R extends { loader?: unknown }>(route: R): R => ({
    ...route,
    ...(typeof route.loader === "function" && {
      loader: gate(route.loader as LoaderFunction),
    }),
  })

  const visit = (route: RouteObject): RouteObject => {
    const { lazy, children } = route
    let gatedLazy = lazy

    if (typeof lazy === "function") {
      gatedLazy = async () => withGatedLoader(await lazy())
    } else if (lazy?.loader) {
      const lazyLoader = lazy.loader

      gatedLazy = {
        ...lazy,
        loader: async () => {
          const loader = await lazyLoader()

          return typeof loader === "function" ? gate(loader) : loader
        },
      }
    }

    return {
      ...withGatedLoader(route),
      ...(gatedLazy && { lazy: gatedLazy }),
      ...(children && { children: children.map(visit) }),
    } as RouteObject
  }

  return routes.map(visit)
}
