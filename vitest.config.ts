import { defineConfig } from "vitest/config";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const local = existsSync(".env.local")
  ? parseEnv(readFileSync(".env.local", "utf8"))
  : {};
if (!process.env.LOOPLABS_TEST_DATABASE_URL && local.LOOPLABS_TEST_DATABASE_URL)
  process.env.LOOPLABS_TEST_DATABASE_URL = local.LOOPLABS_TEST_DATABASE_URL;

export default defineConfig({
  resolve: { alias: { "@": new URL(".", import.meta.url).pathname } },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "lib/engine/**/*.ts",
        "runtime/temporal/activities.ts",
        "runtime/temporal/version-contract.ts",
        "runtime/temporal/outbox.ts",
        "runtime/temporal/operations.ts",
        "runtime/temporal/alert-monitor.ts",
        "lib/control-plane/model.ts",
        "lib/durable/contracts.ts",
        "lib/durable/service.ts",
        "lib/durable/recovery.ts",
        "lib/durable/database.ts",
        "lib/durable/http.ts",
        "lib/durable/client.ts",
        "app/api/durable/**/*.ts",
        "lib/refunds/**/*.ts",
        "lib/connectors/**/*.ts",
        "lib/workflows/**/*.ts",
        "lib/enquiries/**/*.ts",
        "lib/workspace/**/*.ts",
        "app/api/workspace/**/*.ts",
        "app/api/sales/route.ts",
      ],
      exclude: ["**/*.test.ts"],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
        "lib/workspace/**": {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
        "lib/refunds/**": {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
        "lib/workflows/**": {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
        "lib/connectors/**": {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
        "lib/durable/**": {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
      },
    },
  },
});
