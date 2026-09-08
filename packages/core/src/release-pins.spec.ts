import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

/**
 * `packages/registry` hard-pins its @mercurjs dependencies, and those pins must
 * equal the versions the workspace is publishing.
 *
 * WHAT HAPPENS OTHERWISE. Bun resolves a workspace package by name, so once
 * `packages/vendor` is bumped to .8 the pin `"@mercurjs/vendor":
 * "2.3.1-dfactories.6"` can no longer be satisfied — not from the workspace,
 * whose version has moved on, and not from the registry, because the name
 * belongs to the workspace. `bun install` stops with
 *
 *   error: No version matching "2.3.1-dfactories.6" found for specifier
 *   "@mercurjs/vendor" (but package exists)
 *
 * and the publish job dies at Install, before a single package is pushed.
 *
 * WHY IT NEEDS A TEST AND NOT A NOTE. The failure lands in a CI job whose name
 * sits next to a green Lint on the same commit, so `gh run list --limit 1`
 * answers "success" and the release looks done. Two releases in a row were
 * reported as published here while nothing had left the building — and the
 * consumer only finds out later, resolving a version that does not exist.
 *
 * Bumping a package version is therefore a two-file change, and this is the
 * thing that says so at the moment of the bump rather than eight minutes into
 * a CI run.
 */
const repoRoot = path.resolve(__dirname, "..", "..", "..")
const packagesDir = path.join(repoRoot, "packages")

const readJson = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"))

/** Every workspace package's published version, by name. */
const workspaceVersions = (): Map<string, string> => {
  const versions = new Map<string, string>()

  for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue
    }
    const manifest = path.join(packagesDir, entry.name, "package.json")
    if (!fs.existsSync(manifest)) {
      continue
    }
    const { name, version, private: isPrivate } = readJson(manifest)
    if (name && version && !isPrivate) {
      versions.set(name, version)
    }
  }

  return versions
}

describe("release pins", () => {
  const versions = workspaceVersions()

  it("can see the workspace it is checking", () => {
    // Guards the guard: a moved directory would make every assertion below
    // pass over an empty set.
    expect(versions.get("@mercurjs/vendor")).toBeDefined()
    expect(versions.size).toBeGreaterThan(3)
  })

  it("match the versions the workspace publishes", () => {
    const registry = readJson(path.join(packagesDir, "registry", "package.json"))
    const mismatches: string[] = []

    for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
      for (const [name, pinned] of Object.entries<string>(
        registry[field] ?? {}
      )) {
        const actual = versions.get(name)
        // Only names this workspace builds, and only exact pins — a range or a
        // `*` is deliberately not this test's business.
        if (!actual || !/^\d/.test(pinned) || pinned === actual) {
          continue
        }
        mismatches.push(`  ${name}: pinned ${pinned}, workspace is ${actual}`)
      }
    }

    expect(
      mismatches,
      mismatches.length
        ? `packages/registry/package.json is behind the bump — the publish job will die at Install:\n${mismatches.join(
            "\n"
          )}`
        : undefined
    ).toEqual([])
  })
})
