import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Separate from the app's vitest config (jsdom, src/**). Run from the repo root:
//   npx vitest run --config ml/vitest.config.ts
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["ml/**/*.test.ts"],
    root: fileURLToPath(new URL("..", import.meta.url))
  }
});
