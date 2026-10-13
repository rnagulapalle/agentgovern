import {readHistoricalProof} from './historical-proof-sources.mjs';
import {mkdtemp,mkdir,writeFile,rm,symlink,realpath,cp,readlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import { beforeAll, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { gatewaySourceFingerprints, gatewayProofChecks, gatewayProofLimits, validateGatewayReceipt } from "./gateway-bypass-record.mjs";
let current;
beforeAll(async () => { current = await gatewaySourceFingerprints(); });
// Synthetic parser fixture only. It is never retained as runtime acceptance.
const fixture = () => ({ version: 1, completedUtc: "2026-10-09T00:00:00Z",
  scope: "disposable Docker network/TLS/actual Next handlers/PostgreSQL/FetchSandbox twin",
  fixtureSource: { version: 1, commit: "a".repeat(40), archiveSha256: "b".repeat(64), hubspotSpecSha256: "c".repeat(64), trackedFiles: 1 },
  sourceFingerprints: current, bundles: { agent: "a".repeat(64), controller: "b".repeat(64), server: "c".repeat(64) },
  imageIds: { agent: `sha256:${"a".repeat(64)}`, gateway: `sha256:${"a".repeat(64)}`, db: `sha256:${"b".repeat(64)}`, twin: `sha256:${"c".repeat(64)}` },
  checks: Object.fromEntries(gatewayProofChecks.map(c => [c, true])), notProved: gatewayProofLimits,
});
it("binds consistency to all compiled route sources and complete fixture construction inputs", () => {
  const r = fixture(); expect(validateGatewayReceipt(r, current)).toBe(r);
  expect(current).toHaveProperty("app/api/durable/connectors/route.ts");
  expect(current).toHaveProperty("lib/connectors/service.ts");
  expect(Object.keys(current)).toContain("lib/durable/recovery-schema.sql");
  expect(Object.keys(current)).toContain(".dockerignore");
  expect(Object.keys(current)).toContain("scripts/check-connector-health.py");
});
it("refuses every missing or failed runtime assertion and omitted limitations", () => {
  for (const key of gatewayProofChecks) {
    for (const value of [false, undefined]) {
      const r = structuredClone(fixture()); r.checks[key] = value;
      expect(() => validateGatewayReceipt(r, current)).toThrow();
    }
  }
  const r = structuredClone(fixture()); r.notProved = []; expect(() => validateGatewayReceipt(r, current)).toThrow();
});
it("refuses source drift, reduced construction coverage, unknown fields and invalid provenance", () => {
  for (const mutate of [r => delete r.sourceFingerprints["scripts/check-connector-health.py"],
    r => r.sourceFingerprints["lib/connectors/service.ts"] = "0".repeat(64),
    r => r.sourceFingerprints["extra-source"] = "0".repeat(64), r => r.token = "unreviewed",
    r => r.bundles.agent = "invalid", r => r.imageIds.db = r.imageIds.agent,
    r => r.fixtureSource.commit = "branch", r => r.fixtureSource.trackedFiles = 0]) {
    const r = structuredClone(fixture()); mutate(r); expect(() => validateGatewayReceipt(r, current)).toThrow();
  }
  expect(() => validateGatewayReceipt(fixture(), {})).toThrow();
});

it("historical original CI observations retain exact original sources and all three compiled byte hashes", async () => {
  const r = JSON.parse(await readFile("docs/evidence/gateway-bypass-proof.json", "utf8"));
  const historical=readHistoricalProof("gateway-bypass-proof.json");expect(historical.receipt).toEqual(r);expect(historical).toMatchObject({historical:true,eligible:false,releaseAccepted:false,currentSourceValidated:false});
  validateGatewayReceipt(r,Object.fromEntries(Object.entries(historical.sources).map(([file,bytes])=>[file,createHash("sha256").update(bytes).digest("hex")])));
  const require = createRequire(import.meta.url), { build } = createRequire(require.resolve("tsx"))("esbuild");
  const originalConfig=await readFile("docs/evidence/historical-gateway-tsconfig-v1.json");expect(createHash("sha256").update(originalConfig).digest("hex")).toBe("feec4b19d9acba4e15b6c95ad652ed3f7d9c09cd62afadc7c2d8e9416699073b");
  const dir=await realpath(await mkdtemp(join(tmpdir(),"ll-original-gateway-build-")));
  try{
    for(const [file,bytes]of Object.entries(historical.sources)){await mkdir(join(dir,file,".."),{recursive:true});await writeFile(join(dir,file),bytes,{flag:"wx"});}
    await writeFile(join(dir,"tsconfig.json"),originalConfig,{flag:"wx"});
    // Copy genuine installed package bytes into the original relative layout.
    // An outside symlink changes esbuild's emitted module paths, even for identical bytes.
    // The retained three bundle hashes below still reject any dependency/build drift.
    const modules=join(dir,"node_modules"), installed=await realpath(join(process.cwd(),"node_modules"));
    await mkdir(join(modules,".pnpm"),{recursive:true});
    for(const pkg of ["pg-cloudflare@1.4.1","pg-connection-string@2.14.1","pg-int8@1.0.1","pg-pool@3.14.0_pg@8.23.1","pg-protocol@1.16.1","pg-types@2.2.0","pg@8.23.1","pgpass@1.0.5","postgres-array@2.0.0","postgres-bytea@1.0.1","postgres-date@1.0.7","postgres-interval@1.2.0","split2@4.2.0","xtend@4.0.2"]){
      await cp(join(installed,".pnpm",pkg),join(modules,".pnpm",pkg),{recursive:true,dereference:false,verbatimSymlinks:true,errorOnExist:true,force:false});
    }
    const pgTarget=await readlink(join(installed,"pg"));expect(pgTarget).toBe(".pnpm/pg@8.23.1/node_modules/pg");
    await symlink(pgTarget,join(modules,"pg"));
    for (const role of ["server", "agent", "controller"]) {
      const output = await build({absWorkingDir:dir, entryPoints: [`scripts/gateway-trial-${role}.ts`], bundle: true, platform: "node", format: "cjs", write: false, outfile: `/tmp/ll-gateway-freshness/${role}.cjs`, external: ["next/server", "pg-native"], logLevel: "silent" });
      expect(createHash("sha256").update(output.outputFiles[0].contents).digest("hex")).toBe(r.bundles[role]);
    }
  }finally{await rm(dir,{recursive:true,force:true});}
});
