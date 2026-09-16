import { defineConfig } from "vitest/config"

/**
 * Unit tests for the panel build plugin.
 *
 * This package had no test runner and was not in the root `test:unit` filter,
 * so nothing here was ever checked — which is how a `vendorUrl` the caller
 * passed explicitly could be discarded by an unrelated failure and ship to
 * production as a 404 link. What is worth testing is build-time decision
 * logic, so: node environment, no setup files.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    // An empty run must FAIL, so a bad glob cannot turn the gate green while
    // checking nothing.
    passWithNoTests: false,
  },
})
