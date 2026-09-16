import { describe, expect, it, vi } from "vitest"

import { loadMedusaConfig } from "./plugin"

/**
 * A configured vendor URL survives a Medusa config that cannot be read.
 *
 * `loadMedusaConfig` wraps everything in a try/catch that deliberately does not
 * fail the build — a panel should still compile when the backend's config is
 * out of reach. But the catch returned a bare object, so `vendorAppUrl` came
 * back undefined even when the caller had passed `vendorUrl` explicitly. That
 * value never came from the Medusa config in the first place.
 *
 * The failing read is not an edge case, it is the norm: a panel image is built
 * without the backend's secrets, so `medusa-config.ts` fail-closes on the
 * placeholder and the import throws on every production panel build. The
 * result shipped to production on 2026-09-16 — `__VENDOR_URL__` was defined as
 * "", the admin panel's "copy invite link" fell through to the relative
 * `/seller`, and the minifier folded the expression down to that string. On a
 * deployment whose panels are separate subdomains, that link resolves against
 * the ADMIN host and 404s, and it is the only way to accept a team invite.
 *
 * This is the third build-time define on this deployment to fail this way,
 * after `__BASE__` and `__BACKEND_URL__`. Hence a test for the rule rather
 * than for the instance.
 */

const UNREADABLE = "/nonexistent/medusa-config.ts"

describe("loadMedusaConfig", () => {
  it("keeps a configured vendorUrl when the config cannot be read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    const result = await loadMedusaConfig(UNREADABLE, process.cwd(), {
      isDevelopment: false,
      vendorUrl: "https://vendor.dfactories.com",
    })

    expect(result.vendorAppUrl).toBe("https://vendor.dfactories.com")
    // The failure is still reported — surviving it must not mean hiding it.
    expect(warn).toHaveBeenCalled()

    warn.mockRestore()
  })

  it("trims a trailing slash off the configured URL", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    const result = await loadMedusaConfig(UNREADABLE, process.cwd(), {
      isDevelopment: false,
      vendorUrl: "https://vendor.dfactories.com/",
    })

    // `${base}/invite` would otherwise produce a double slash.
    expect(result.vendorAppUrl).toBe("https://vendor.dfactories.com")

    warn.mockRestore()
  })

  it("reports no vendor URL when none was configured and the config is unreadable", async () => {
    // Unchanged behaviour: with nothing to fall back on, the caller gets
    // undefined rather than a relative path invented here.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    const result = await loadMedusaConfig(UNREADABLE, process.cwd(), {
      isDevelopment: false,
    })

    expect(result.vendorAppUrl).toBeUndefined()

    warn.mockRestore()
  })
})
