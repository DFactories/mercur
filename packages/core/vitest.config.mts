import { defineConfig } from "vitest/config"

/**
 * Unit tests for the backend package.
 *
 * `packages/core` had no test runner at all, which is why a customer-facing
 * money bug — every order-placed SMS quoting a total of 0 — could ship and sit
 * unnoticed. Node environment and no setup files: what is worth testing here is
 * pure decision logic (how an amount is written, which recipient an event
 * resolves to), and anything needing a live container belongs in
 * `integration-tests` instead.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    // `__tests__/*.unit.spec.ts` is upstream Mercur's convention for specs run
    // by Jest (`integration-tests`' `test:unit`, chained from the root
    // `test:unit`). They use Jest globals, so Vitest must not collect them.
    exclude: ["**/node_modules/**", "src/**/__tests__/**/*.unit.spec.ts"],
    // An empty run must FAIL, so a bad glob cannot turn the gate green while
    // checking nothing.
    passWithNoTests: false,
  },
})
