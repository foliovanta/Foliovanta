import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
      // `server-only` throws when imported outside Next's RSC bundler; stub it
      // so server services can be exercised in integration tests.
      "server-only": path.resolve(process.cwd(), "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/integration/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});
