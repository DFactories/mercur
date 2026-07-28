import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const src = (segment: string) =>
  fileURLToPath(new URL(`./src/${segment}`, import.meta.url))

// Vitest does not read `compilerOptions.paths`, so the tsconfig aliases are
// mirrored here. Without them a spec importing a module that uses `@pages/...`
// fails to resolve at load time rather than failing an assertion.
export default defineConfig({
  resolve: {
    alias: {
      "@components": src("components"),
      "@hooks": src("hooks"),
      "@lib": src("lib"),
      "@pages": src("pages"),
      "@providers": src("providers"),
      "@assets": src("assets"),
      "@": src(""),
    },
  },
})
