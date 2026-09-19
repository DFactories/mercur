import { readFileSync, readdirSync, statSync } from "fs"
import { dirname, join, relative } from "path"
import { describe, expect, it } from "vitest"

import { adminMiddlewares } from "../middlewares"

const ADMIN_API_DIR = join(__dirname, "..")

function walk(dir: string, name: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full, name))
    else if (entry === name) out.push(full)
  }
  return out
}

function urlFor(file: string): string {
  const parts = relative(ADMIN_API_DIR, file)
    .split("/")
    .slice(0, -1)
    .map((p) => (p.startsWith("[") && p.endsWith("]") ? `:${p.slice(1, -1)}` : p))
  return "/admin" + (parts.length ? "/" + parts.join("/") : "")
}

function httpMethods(src: string): string[] {
  const found = new Set<string>()
  for (const re of [
    /export\s+(?:async\s+)?function\s+(GET|POST|DELETE|PUT|PATCH)\b/g,
    /export\s+const\s+(GET|POST|DELETE|PUT|PATCH)\b/g,
  ]) {
    for (const m of src.matchAll(re)) found.add(m[1])
  }
  return [...found].sort()
}

/**
 * Matchers Medusa core itself declares a policy on.
 *
 * Read out of the installed package rather than listed here. Core covers its
 * own detail routes with **methodless** wildcard entries — `/admin/orders/*`
 * with `order:read` — and 52 of its admin entries are exactly that. Anything
 * this package adds beneath one of those prefixes is already guarded, and
 * re-declaring it would be a duplicate to keep in step with core forever.
 *
 * Listing them by hand would be the stale-list problem this sweep exists to
 * solve, one level up.
 */
function coreGuardedMatchers(): string[] {
  const root = join(
    dirname(require.resolve("@medusajs/medusa/package.json")),
    "dist",
    "api",
    "admin"
  )
  const out: string[] = []
  for (const file of walk(root, "middlewares.js")) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(file)
    for (const value of Object.values(mod)) {
      if (!Array.isArray(value)) continue
      for (const entry of value as { matcher?: string; policies?: unknown[] }[]) {
        if (!entry?.matcher) continue
        if (!entry.policies || (entry.policies as unknown[]).length === 0) continue
        out.push(entry.matcher)
      }
    }
  }
  return out
}

function covers(matcher: string, url: string): boolean {
  const rx = new RegExp(
    "^" +
      matcher
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/:[A-Za-z_]\w*/g, "[^/]+") +
      "$"
  )
  return rx.test(url)
}

/**
 * RELEASE 2 — every admin route in this package is guarded.
 *
 * Counts ROUTE FILES, not middleware entries. Six groups here have no
 * `middlewares.ts` at all, so an entry-based sweep has nothing to fail on and
 * reports them as fine.
 *
 * Coverage may come from this package's own declarations or from core's, and
 * the test reads BOTH from the real thing — `adminMiddlewares` as exported, and
 * core's compiled middleware modules — rather than from a list. A sweep that
 * recomputed the declarations from the same map that produces them would keep
 * passing after someone deleted the line that uses the map.
 */
describe("release 2 — every admin route in this package is guarded", () => {
  const routes = walk(ADMIN_API_DIR, "route.ts").map((file) => ({
    url: urlFor(file),
    methods: httpMethods(readFileSync(file, "utf8")),
  }))

  const ours = adminMiddlewares
    .filter((e) => {
      const p = (e as { policies?: unknown }).policies
      return Array.isArray(p) ? p.length > 0 : !!p
    })
    .map((e) => String(e.matcher))

  const matchers = [...new Set([...ours, ...coreGuardedMatchers()])]

  it("finds routes and declarations (guards the sweep itself)", () => {
    expect(routes.length).toBeGreaterThan(50)
    expect(ours.length).toBeGreaterThan(0)
    expect(matchers.length).toBeGreaterThan(ours.length) // core's were found too
  })

  it("leaves no admin route without a policy declaration", () => {
    const unguarded = routes
      .filter((r) => r.methods.length > 0)
      .filter((r) => !matchers.some((m) => covers(m, r.url)))
      .map((r) => `${r.methods.join("/")} ${r.url}`)
      .sort()

    expect(unguarded).toEqual([])
  })
})
