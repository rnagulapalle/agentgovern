import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { register } from "../../instrumentation";

const mocks = vi.hoisted(() => ({ bootstrap: vi.fn(), initializer: vi.fn(), hook: vi.fn() }));
// Startup contract unit double only; genuine installation/HTTP tests remain required.
vi.mock("./tenant-bootstrap", () => ({ bootstrapTenantContext: mocks.bootstrap }));
vi.mock("../quotes/native-demo-bootstrap", () => ({ nativeQuoteDemoInitializer: mocks.initializer }));
beforeEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); mocks.bootstrap.mockResolvedValue(undefined); mocks.initializer.mockReturnValue(mocks.hook); });
afterEach(() => vi.unstubAllEnvs());
it("does not load PostgreSQL bootstrap in the edge runtime", async () => {
  vi.stubEnv("NEXT_RUNTIME", "edge");
  await register();
  expect(mocks.bootstrap).not.toHaveBeenCalled();
});
it("refuses absent web publication and orphan quote background before activation", async () => {
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  vi.stubEnv("LOOPLABS_TENANT_WEB_CONFIG", "");
  vi.stubEnv("LOOPLABS_QUOTE_DEMO_CONFIG", "");
  vi.stubEnv("LOOPLABS_QUOTE_BACKGROUND_CONFIG", "");
  await expect(register()).rejects.toThrow("installation unavailable");
  vi.stubEnv("LOOPLABS_TENANT_WEB_CONFIG", "/owned/web.json");
  vi.stubEnv("LOOPLABS_QUOTE_BACKGROUND_CONFIG", "/owned/background.json");
  await expect(register()).rejects.toThrow("exact quote web installation");
  expect(mocks.bootstrap).not.toHaveBeenCalled();
  expect(mocks.initializer).not.toHaveBeenCalled();
});
it("retains default installed-runtime ACK startup and propagates publication failure", async () => {
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  vi.stubEnv("LOOPLABS_TENANT_WEB_CONFIG", "/owned/web.json");
  vi.stubEnv("LOOPLABS_QUOTE_DEMO_CONFIG", "");
  vi.stubEnv("LOOPLABS_QUOTE_BACKGROUND_CONFIG", "");
  await register();
  expect(mocks.bootstrap).toHaveBeenCalledExactlyOnceWith("/owned/web.json", true, false, undefined, undefined, undefined);
  expect(mocks.initializer).not.toHaveBeenCalled();
  mocks.bootstrap.mockRejectedValueOnce(Error("Owned publication refused"));
  await expect(register()).rejects.toThrow("Owned publication refused");
});
it("wires the actual same-pool quote initializer before tenant activation without fixture context", async () => {
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  vi.stubEnv("LOOPLABS_TENANT_WEB_CONFIG", "/owned/web.json");
  vi.stubEnv("LOOPLABS_QUOTE_DEMO_CONFIG", "/owned/quote.json");
  vi.stubEnv("LOOPLABS_QUOTE_BACKGROUND_CONFIG", "/owned/background.json");
  await register();
  expect(mocks.initializer).toHaveBeenCalledExactlyOnceWith("/owned/quote.json", undefined, "/owned/background.json");
  expect(mocks.bootstrap).toHaveBeenCalledExactlyOnceWith("/owned/web.json", true, false, undefined, undefined, mocks.hook);
  mocks.initializer.mockImplementationOnce(() => { throw Error("Quote generation refused"); });
  await expect(register()).rejects.toThrow("Quote generation refused");
  expect(mocks.bootstrap).toHaveBeenCalledTimes(1);
});
it("converts all retained singleton HTTP and SSR consumers without importing quote engine activation", async () => {
  const paths = [
    "app/api/durable/connectors/route.ts", "app/api/durable/refunds/route.ts", "app/api/durable/route.ts",
    "app/api/durable/session/route.ts", "app/api/durable/workflows/route.ts", "app/api/sales/route.ts",
    "app/api/workspace/agents/route.ts", "app/api/workspace/discovery/owners/route.ts", "app/api/workspace/discovery/route.ts",
    "app/api/workspace/enquiries/execution/route.ts", "app/api/workspace/enquiries/route.ts", "app/api/workspace/records/route.ts",
    "app/api/workspace/session/route.ts", "app/control-plane/layout.tsx", "app/control-plane/requests/page.tsx",
    "components/control-plane/workspace-gate.tsx",
  ];
  for (const path of paths) {
    const source = ts.createSourceFile(path, await readFile(path, "utf8"), ts.ScriptTarget.Latest, true);
    const calls: string[] = [];
    const imports: string[] = [];
    const walk = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) calls.push(node.expression.text);
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
      ts.forEachChild(node, walk);
    };
    walk(source);
    expect(calls, path).not.toContain("database");
    expect(imports.filter(value => value.endsWith("durable/database")), path).toEqual(path.endsWith("enquiries/execution/route.ts") ? ["../../../../../lib/durable/database"] : []);
    expect(calls, path).toContain(path.includes("control-plane/layout") || path.includes("control-plane/requests") ? "workspaceContext" : "tenantContext");
    expect(imports.some(value => value.includes("quotes/")), path).toBe(false);
  }
});
it("requires the same sealed workload boundary for every retained worker and scheduler launcher", async () => {
  for (const name of ["durable-worker", "enquiry-worker", "temporal-service"]) {
    const file = `scripts/${name}.ts`;
    const source = ts.createSourceFile(file, await readFile(file, "utf8"), ts.ScriptTarget.Latest, true);
    const pools: ts.NewExpression[] = [];
    const factories: ts.CallExpression[] = [];
    const walk = (node: ts.Node) => {
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Pool") pools.push(node);
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "createWorkloadPool") factories.push(node);
      ts.forEachChild(node, walk);
    };
    walk(source);
    expect(pools, file).toHaveLength(0);
    expect(factories, file).toHaveLength(1);
    expect(factories[0].arguments[0].getText(source), file).toBe("process.env");
    expect(factories[0].arguments[1].getText(source), file).toBe(name === "temporal-service" ? "config.role" : '"worker"');
    expect(factories[0].arguments.length, file).toBe(name === "temporal-service" ? 3 : 2);
  }
});
