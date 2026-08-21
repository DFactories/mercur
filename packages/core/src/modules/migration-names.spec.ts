import fs from "fs"
import path from "path"

import { describe, expect, it } from "vitest"

/**
 * Medusa records every module's migrations in one shared `mikro_orm_migrations`
 * table, keyed by class name alone. Two modules that ship the same
 * `MigrationYYYYMMDDHHMMSS` name are therefore indistinguishable: whichever runs
 * first claims the name, and the other is skipped forever — silently, with no
 * error, leaving its columns missing until a query finally trips over them.
 *
 * That is not hypothetical. `shipping-option-type-delivery` once shipped
 * `Migration20260625000000`, the same name Medusa 2.18's order module uses to add
 * `metadata`/`data` to the tax-line tables. Ours won, Medusa's never ran, and
 * every cart completion failed with `column t5.metadata does not exist`.
 */
const modulesDir = __dirname

function migrationNames(dir: string): { name: string; file: string }[] {
  const out: { name: string; file: string }[] = []
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (/^Migration\d+\.ts$/.test(entry.name)) {
        out.push({ name: entry.name.replace(/\.ts$/, ""), file: full })
      }
    }
  }
  walk(dir)
  return out
}

function installedMedusaMigrationNames(): Set<string> {
  const root = path.resolve(__dirname, "../../../../node_modules/.bun")
  const names = new Set<string>()
  if (!fs.existsSync(root)) {
    return names
  }
  for (const pkg of fs.readdirSync(root)) {
    if (!pkg.startsWith("@medusajs+")) {
      continue
    }
    const migrations = path.join(
      root,
      pkg,
      "node_modules",
      "@" + pkg.split("@")[1].replace("+", "/"),
      "dist",
      "migrations"
    )
    if (!fs.existsSync(migrations)) {
      continue
    }
    for (const f of fs.readdirSync(migrations)) {
      const m = /^(Migration\d+)\.js$/.exec(f)
      if (m) {
        names.add(m[1])
      }
    }
  }
  return names
}

describe("migration names", () => {
  const ours = migrationNames(modulesDir)

  it("ships at least one migration (guards against a broken glob)", () => {
    expect(ours.length).toBeGreaterThan(0)
  })

  it("has no duplicates across our own modules", () => {
    const seen = new Map<string, string>()
    const clashes: string[] = []
    for (const { name, file } of ours) {
      const prev = seen.get(name)
      if (prev) {
        clashes.push(`${name}: ${prev} vs ${file}`)
      } else {
        seen.set(name, file)
      }
    }
    expect(clashes).toEqual([])
  })

  it("does not reuse a migration name shipped by an installed Medusa module", () => {
    const medusa = installedMedusaMigrationNames()
    if (medusa.size === 0) {
      return // dependencies not installed; nothing to compare against
    }
    const clashes = ours
      .filter(({ name }) => medusa.has(name))
      .map(({ name, file }) => `${name} (${file})`)
    expect(clashes).toEqual([])
  })
})
