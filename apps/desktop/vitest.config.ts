import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Reuse the renderer's resolve aliases + plugins (react JSX, tailwind) so unit
// and component tests resolve "@/...", "@hermes/shared", and the deduped React
// copy exactly like the running app. The bare `test:ui` script previously had
// no `include`, so vitest globbed release/, build/, electron/*.cjs (node:test)
// and packaged node-pty test fixtures - all of which fail collection. Scope to
// the renderer source tree and wire the localStorage shim.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      environmentOptions: {
        jsdom: { url: "https://localhost/" },
      },
      setupFiles: ["./vitest.setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
    },
  }),
);
