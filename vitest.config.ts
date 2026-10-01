import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": new URL(".", import.meta.url).pathname } },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "lib/engine/**/*.ts",
        "lib/control-plane/model.ts",
      ],
      exclude: ["**/*.test.ts"],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
  },
});
