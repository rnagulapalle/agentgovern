// Disposable actual-route/FetchSandbox network proof; no customer deployment.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { gatewayProofFiles, gatewayProofLimits } from "./gateway-bypass-record.mjs";
import { ownedBuilder } from "./staging-owned-builder.mjs";
import { browserCertificates } from "./staging-browser-tls.mjs";
const require = createRequire(import.meta.url), { build } = createRequire(require.resolve("tsx"))("esbuild");
export async function gatewayBypassProof(output) {
 assert(process.env.LOOPLABS_GATEWAY_BYPASS_PROOF === "isolated", "Explicit isolated bypass proof opt-in required");
 assert(output?.startsWith("/") && !output.split("/").includes(".."), "New absolute evidence directory required");
 await mkdir(output, { mode: 0o700 });
 const dir = await mkdtemp(join(tmpdir(), "ll-gateway-proof-")), prefix = `ll-gateway-${randomBytes(6).toString("hex")}`, front = `${prefix}-front`, back = `${prefix}-back`, image = `${prefix}:twin`;
 const names = { db: `${prefix}-db`, twin: `${prefix}-twin`, gateway: `${prefix}-gateway`, agent: `${prefix}-agent` }, owned = [], networks = [];
 const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", timeout: 300000, maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();
 const token = () => randomBytes(32).toString("base64url"), provider = token(), agent = token(), operator = token(), legacyOperator = token(), password = token(), recoveryEpoch = randomUUID();
 const origin = "https://looplabs-staging.example.test:3443", state = join(dir, "state"), tls = join(dir, "tls"), bundles = join(dir, "bundles"), sourcePaths = new Set(gatewayProofFiles);
 const builder = ownedBuilder(docker, `ll-platform-${prefix.slice("ll-gateway-".length)}-build`);
 let built = false, stateCreated = false, stage = "prepare", receipt;
 const hash = b => createHash("sha256").update(b).digest("hex");
 const wait = ms => new Promise(r => setTimeout(r, ms));
 const until = async fn => { for (let i = 0; i < 60; i++) { try { return await fn(); } catch { if (i === 59) throw Error("Owned trial service not ready"); await wait(500); } } };
 const inspect = name => JSON.parse(docker("inspect", name))[0];
 try {
  assert(Number(docker("info", "--format", "{{.MemTotal}}")) >= 5 * 1024 ** 3, "Disposable capacity required; do not resize shared Docker");
  await mkdir(state, { mode: 0o700 }); stateCreated = true; await mkdir(bundles, { mode: 0o700 });
  // Docker cannot create a nested mountpoint inside the read-only parent bind.
  await mkdir(join(bundles, "node_modules"), { mode: 0o700 }); await browserCertificates(tls);
  for (const role of ["server", "agent", "controller"]) {
   const result = await build({ entryPoints: [`scripts/gateway-trial-${role}.ts`], bundle: true, platform: "node", format: "cjs", outfile: join(bundles, `${role}.cjs`), external: ["next/server", "pg-native"], metafile: true, logLevel: "silent" });
   for (const path of Object.keys(result.metafile.inputs)) if (!path.startsWith("node_modules/")) sourcePaths.add(path);
  }
  for (const path of ["lib/workspace/membership-authority.ts","lib/workspace/membership-authority-schema.sql","lib/quotes/schema.sql","lib/quotes/authority-schema.sql","lib/quotes/plan-v2-schema.sql","lib/quotes/membership-schema.sql","lib/durable/schema.sql", "lib/workspace/schema.sql", "lib/connectors/schema.sql", "lib/workflows/schema.sql", "lib/enquiries/schema.sql"]) sourcePaths.add(path);
  const sourceFingerprints = Object.fromEntries(await Promise.all([...sourcePaths].sort().map(async p => [p, hash(await readFile(p))])));
  stage = "twin-image";
  const backend = process.env.FETCHSANDBOX_BACKEND_PATH;
  assert(backend?.startsWith("/"), "Explicit prepared private fixture backend required");
  const fixtureSource = JSON.parse(await readFile(resolve(backend, "../fixture-source-manifest.json"), "utf8"));
  assert.equal(fixtureSource.version, 1);
  assert(/^[a-f0-9]{40}$/.test(fixtureSource.commit));
  assert(/^[a-f0-9]{64}$/.test(fixtureSource.archiveSha256));
  assert.equal(hash(await readFile(join(backend, "specs/hubspot/openapi.yaml"))), fixtureSource.hubspotSpecSha256);
  builder.start();
  builder.build("-f", "Dockerfile.connector-twin", "--build-context", `fetchsandbox=${backend}`, "-t", image, "."); built = true;
  builder.close(); // Remove the owned 3GiB builder before runtime admission.
  await writeFile(join(state, "connector-twin-credentials.json"), JSON.stringify({ token: provider }), { mode: 0o600 });
  if (process.platform === "linux") docker("run", "--rm", "--mount", `type=bind,src=${state},dst=/state`, "--user", "0", "--entrypoint", "chown", image, "-R", "1000:1000", "/state");
  for (const n of [front, back]) { docker("network", "create", "--internal", n); networks.push(n); }
  const run = (name, network, ...args) => { owned.push(name); docker("run", "-d", "--name", name, "--network", network, "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "256", ...args); };
  await writeFile(join(dir, "db.env"), `POSTGRES_USER=trial\nPOSTGRES_DB=trial\nPOSTGRES_PASSWORD=${password}\n`, { mode: 0o600 });
  stage = "private-services";
  run(names.db, back, "--network-alias", "trial-db", "--memory", "512m", "--cap-add", "CHOWN", "--cap-add", "DAC_OVERRIDE", "--cap-add", "FOWNER", "--cap-add", "SETGID", "--cap-add", "SETUID", "--env-file", join(dir, "db.env"), "postgres:16");
  run(names.twin, back, "--network-alias", "connector-twin", "--memory", "256m", "--read-only", "--tmpfs", "/tmp", "--mount", `type=bind,src=${state},dst=/state`, image);
  await until(() => docker("exec", names.db, "pg_isready", "-U", "trial"));
  await until(() => docker("exec", names.twin, "python", "/app/scripts/check-connector-health.py"));
  const providerIp = inspect(names.twin).NetworkSettings.Networks[back].IPAddress, databaseIp = inspect(names.db).NetworkSettings.Networks[back].IPAddress;
  await writeFile(join(dir, "gateway.env"), `LOOPLABS_DATABASE_URL=postgresql://trial:${password}@trial-db:5432/trial\nLOOPLABS_CONNECTOR_TWIN_URL=http://connector-twin:8018\nLOOPLABS_CONNECTOR_TWIN_TOKEN=${provider}\nLOOPLABS_DURABLE_ORIGIN=${origin}\nLOOPLABS_TEMPORAL_WORKSPACE=staging\nLOOPLABS_RECOVERY_EPOCH=${recoveryEpoch}\nNODE_EXTRA_CA_CERTS=/run/tls/ca.pem\n`, { mode: 0o600 });
  const controller = { origin, agent, operator, legacyOperator, provider };
  await writeFile(join(dir, "controller.json"), JSON.stringify(controller), { mode: 0o600 });
  run(names.gateway, back, "--memory", "512m", "--user", `${process.getuid()}:${process.getgid()}`, "--read-only", "--tmpfs", "/tmp", "--env-file", join(dir, "gateway.env"), "--mount", `type=bind,src=${bundles},dst=/trial,readonly`, "--mount", `type=bind,src=${resolve("node_modules")},dst=/trial/node_modules,readonly`, "--mount", `type=bind,src=${resolve("lib")},dst=/app/lib,readonly`, "--mount", `type=bind,src=${tls},dst=/run/tls,readonly`, "--mount", `type=bind,src=${join(dir, "controller.json")},dst=/run/controller.json,readonly`, "node:22-bookworm-slim", "node", "/trial/server.cjs");
  docker("network", "connect", "--alias", "looplabs-staging.example.test", front, names.gateway);
  await until(() => docker("exec", names.gateway, "node", "-e", `fetch('${origin}/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`));
  const control = mode => {
   try { return JSON.parse(docker("exec", names.gateway, "node", "/trial/controller.cjs", mode)); }
   catch (e) {
    try { const d = JSON.parse(e.stderr); if (d.trialController === "refused") console.error(JSON.stringify({ trialController: "refused", mode, code: /^[A-Z0-9]{5}$/.test(d.code) ? d.code : undefined, status: Number.isInteger(d.status) ? d.status : undefined })); } catch { /* Never print raw stderr. */ }
    throw Error("Trusted controller operation failed");
   }
  };
  stage = "enrollment"; Object.assign(controller, control("seed")); await writeFile(join(dir, "controller.json"), JSON.stringify(controller));
  const agentConfig = { origin, token: agent, providerIp, databaseIp, crm: controller.crm, email: controller.email, expected: "held" };
  const agentFile = join(dir, "agent.json"); await writeFile(agentFile, JSON.stringify(agentConfig), { mode: 0o600 });
  run(names.agent, front, "--memory", "128m", "--user", `${process.getuid()}:${process.getgid()}`, "--read-only", "--tmpfs", "/tmp", "--env", "NODE_EXTRA_CA_CERTS=/run/ca.pem", "--mount", `type=bind,src=${join(bundles, "agent.cjs")},dst=/trial/agent.cjs,readonly`, "--mount", `type=bind,src=${agentFile},dst=/run/agent.json,readonly`, "--mount", `type=bind,src=${join(tls, "ca.pem")},dst=/run/ca.pem,readonly`, "node:22-bookworm-slim", "node", "-e", "setInterval(()=>{},1000)");
  const act = mode => {
   try { const r = JSON.parse(docker("exec", names.agent, "node", "/trial/agent.cjs", mode)); assert.equal(r.passed, true); }
   catch (e) {
    try { const d = JSON.parse(e.stderr); if (d.agentTrial === "refused") console.error(JSON.stringify({ agentTrial: "refused", mode, status: Number.isInteger(d.status) ? d.status : undefined })); } catch { /* Never print raw stderr. */ }
    throw Error("Agent operation refused");
   }
  };
  const effects = () => Object.keys(JSON.parse(docker("exec", names.twin, "cat", "/state/connector-twin-state.json")).effects).length;
  stage = "bypass-denial"; act("probe"); assert.equal(control("zero").passed, true); assert.equal(effects(), 0);
  const a = inspect(names.agent); assert.deepEqual(Object.keys(a.NetworkSettings.Networks), [front]); assert(!a.Mounts.some(m => /state|controller|node_modules|docker.sock|tls/.test(m.Destination))); assert.equal(a.HostConfig.ReadonlyRootfs, true); assert.equal(Object.keys(a.HostConfig.PortBindings || {}).length, 0);
  stage = "held-approval"; act("crm"); act("privileges"); assert.equal(effects(), 0);
  assert.equal(control("fence").passed, true); act("fenced"); assert.equal(effects(), 0); assert.equal(control("unfence").passed, true); act("read");
  docker("stop", "-t", "2", names.gateway); act("outage"); assert.equal(effects(), 0); docker("start", names.gateway); await until(() => { act("read"); return true; });
  stage = "lost-response"; assert.equal(control("execute-crm").passed, true); assert.equal(effects(), 1);
  agentConfig.expected = "uncertain"; await writeFile(agentFile, JSON.stringify(agentConfig)); docker("kill", "--signal", "KILL", names.gateway); docker("start", names.gateway); await until(() => { act("read"); return true; }); assert.equal(control("reconcile-crm").passed, true); assert.equal(effects(), 1);
  stage = "dependent-email"; act("email"); assert.equal(effects(), 1); assert.equal(control("execute-email").passed, true); assert.equal(control("verify").passed, true); assert.equal(effects(), 2);
  stage = "provider-restart"; docker("kill", "--signal", "KILL", names.twin); docker("start", names.twin); await until(() => docker("exec", names.twin, "python", "/app/scripts/check-connector-health.py")); assert.equal(control("readback").passed, true); assert.equal(effects(), 2);
  stage = "revocation"; assert.equal(control("revoke").passed, true); act("revoked"); assert.equal(effects(), 2);
  assert.deepEqual(Object.fromEntries(await Promise.all([...sourcePaths].sort().map(async p => [p, hash(await readFile(p))]))), sourceFingerprints);
  receipt = { version: 1, completedUtc: new Date().toISOString(), scope: "disposable Docker network/TLS/actual Next handlers/PostgreSQL/FetchSandbox twin", fixtureSource, sourceFingerprints, bundles: Object.fromEntries(await Promise.all(["server", "agent", "controller"].map(async role => [role, hash(await readFile(join(bundles, `${role}.cjs`)))]))), imageIds: Object.fromEntries(Object.entries(names).map(([role, name]) => [role, inspect(name).Image])), checks: { installedMembershipHistoryAndGenuineNamedApproval: true, agentHasNoProviderOrDatabaseCredential: true, agentOnlyFrontNetwork: true, directProviderDnsAndIpDenied: true, directDatabaseIpDenied: true, agentPrivilegeOperationsDenied: true, zeroEffectsBeforeApproval: true, sameIdReplayAndSingleReservation: true, independentNamedApproval: true, controlOutageNoFailOpen: true, heldStateSurvivesRestart: true, lostResponseReconciledWithoutResend: true, dependentEmailVerified: true, exactlyTwoEffects: true, providerEffectsSurviveSigkill: true, revokedAgentDenied: true, trustedTestCertificateVerifiedByNode: true, externalRecoveryEpochEnforced: true, completedRunReverifyRefusedWithoutNewEffects: true }, notProved: gatewayProofLimits };
 } catch {
  const diagnostic = { stage, services: Object.fromEntries(Object.entries(names).map(([role, name]) => {
   try { const s = inspect(name).State; const log = spawnSync("docker", ["logs", "--tail", "8", name], { encoding: "utf8", timeout: 10000, maxBuffer: 65536 }); const codes = [...new Set(((log.stdout || "") + (log.stderr || "")).match(/\b(?:ERR_[A-Z_]+|MODULE_NOT_FOUND|EACCES|ENOENT|EPERM)\b/g) || [])]; return [role, { running: s.Running, exitCode: s.ExitCode, oomKilled: s.OOMKilled, errorCodes: codes }]; }
   catch { return [role, { created: false }]; }
  })) };
  console.error(JSON.stringify(diagnostic)); // No Config/env, raw logs, credentials or payloads.
  throw Error(`Gateway bypass trial failed at ${stage}; no acceptance receipt written`);
 }
 finally {
  const failures = [];
  try { builder.close(); } catch { failures.push("owned-builder"); }
  for (const name of owned.reverse()) try { docker("rm", "-f", "-v", name); } catch { failures.push(name); }
  for (const n of networks.reverse()) try { docker("network", "rm", n); } catch { failures.push(n); }
  if (built) try { docker("image", "rm", image); } catch { failures.push(image); }
  if (process.platform === "linux" && stateCreated) try { docker("run", "--rm", "--network", "none", "--user", "0", "--mount", `type=bind,src=${state},dst=/state`, "python:3.12-slim", "python", "-c", `import pathlib,shutil,os; p=pathlib.Path("/state"); [(shutil.rmtree(x) if x.is_dir() and not x.is_symlink() else x.unlink()) for x in p.iterdir()]; os.chown(p,${process.getuid()},${process.getgid()})`); } catch { failures.push("private-state"); }
  await rm(dir, { recursive: true, force: true }); assert.equal(failures.length, 0, "Owned trial cleanup incomplete; no acceptance receipt written");
 }
 receipt.checks.ownedResourcesRemoved = true;
 await writeFile(join(output, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600, flag: "wx" }); return receipt;
}
if (process.argv[1] === new URL(import.meta.url).pathname) gatewayBypassProof(process.argv[2]).then(r => console.log(JSON.stringify({ passed: true, checks: r.checks, notProved: r.notProved }))).catch(e => { console.error(e.message); process.exitCode = 1; });
