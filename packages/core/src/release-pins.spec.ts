import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

/**
 * A workspace manifest that hard-pins another @mercurjs package must pin the
 * version the workspace is actually publishing.
 *
 * NOT ONLY `packages/registry`. This test used to check that one manifest, and
 * missed four: `packages/vendor`, `packages/admin`, `packages/dashboard-shared`
 * and the registry ALL pin `@mercurjs/core`. Bumping core to .12 on 2026-09-09
 * broke `bun install` on every one of them at once —
 *
 *   error: No version matching "2.3.1-dfactories.11" found for specifier
 *   "@mercurjs/core" (but package exists)
 *   error: @mercurjs/core@2.3.1-dfactories.11 failed to resolve   (x4)
 *
 * — while this spec stayed green, which is precisely the eight-minutes-into-CI
 * failure it exists to prevent.
 *
 * WHAT HAPPENS OTHERWISE. Bun resolves a workspace package by name, so once
 * `packages/vendor` is bumped to .9 the pin `"@mercurjs/vendor":
 * "2.3.1-dfactories.8"` can no longer be satisfied — not from the workspace,
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

/**
 * Every workspace manifest, private ones included — a private package still
 * has to resolve its dependencies for `bun install` to finish.
 */
const workspaceManifests = (): string[] => {
  const roots = [packagesDir, path.join(packagesDir, "providers"), path.join(repoRoot, "apps")]
  const manifests: string[] = []

  for (const root of roots) {
    if (!fs.existsSync(root)) {
      continue
    }
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue
      }
      const manifest = path.join(root, entry.name, "package.json")
      if (fs.existsSync(manifest)) {
        manifests.push(manifest)
      }
    }
  }

  return manifests
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
    const mismatches: string[] = []

    for (const manifest of workspaceManifests()) {
      const pkg = readJson(manifest)
      for (const field of [
        "dependencies",
        "devDependencies",
        "peerDependencies",
      ]) {
        for (const [name, pinned] of Object.entries<string>(pkg[field] ?? {})) {
          const actual = versions.get(name)
          // Only names this workspace builds, and only the prereleases this
          // fork publishes and bumps. An upstream pin like `"@mercurjs/client":
          // "2.3.1"` resolves from npmjs and is deliberately not our business —
          // `apps/storefront` carries two of those and always has.
          if (!actual || !pinned.includes("-dfactories.") || pinned === actual) {
            continue
          }
          mismatches.push(
            `  ${path.relative(repoRoot, manifest)} pins ${name} at ${pinned}, workspace is ${actual}`
          )
        }
      }
    }

    expect(
      mismatches,
      mismatches.length
        ? `a manifest is behind the bump — the publish job will die at Install:\n${mismatches.join(
            "\n"
          )}`
        : undefined
    ).toEqual([])
  })
})
