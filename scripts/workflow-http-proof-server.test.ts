import { test, expect } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createInstalledTenantFixture } from '../lib/workspace/installed-tenant-fixture';
import { digest, WORKSPACE_COOKIE } from '../lib/workspace/identity';
import { stopProofChild } from './connector-proof-installation';

function launch(publication?: string, fence?: { org: string; epoch: string }) {
  return spawn(process.execPath, ['--import', 'tsx', 'scripts/workflow-http-proof-server.ts'], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'test',
      ...(publication ? { LOOPLABS_PROOF_WEB_PUBLICATION: publication } : {}),
      ...(fence ? { LOOPLABS_WORKSPACE_ID: fence.org, LOOPLABS_RECOVERY_EPOCH: fence.epoch } : {}),
      LOOPLABS_CONNECTOR_TWIN_URL: 'http://127.0.0.1:8018',
      LOOPLABS_CONNECTOR_TWIN_TOKEN: randomBytes(32).toString('base64url') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
async function ready(child: ChildProcess) {
  let stdout = '';
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Installed listener did not become ready')), 10000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(Error('Installed listener exited')); });
    child.stdout!.on('data', bytes => {
      stdout = (stdout + String(bytes)).slice(-4096);
      const match = stdout.match(/\{"port":(\d+)\}/);
      if (match) { clearTimeout(timer); resolve('http://127.0.0.1:' + match[1]); }
    });
    child.stderr!.resume();
  });
}
test('missing installed publication refuses before publishing a listener', async () => {
  const child = launch(); let stdout = '', stderr = '';
  child.stdout!.on('data', bytes => { stdout += String(bytes); });
  child.stderr!.on('data', bytes => { stderr += String(bytes); });
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject); child.once('exit', resolve);
    });
    expect(code).toBe(1); expect(stdout).not.toContain('"port"');
    expect(stderr).toContain('Installed workflow proof startup refused.');
  } finally { await stopProofChild(child); }
}, 15000);
test('actual installed named context serves workflow reads and rejects anonymous or malformed requests without creating actions', async () => {
  const session = randomBytes(32).toString('base64url');
  const fixture = await createInstalledTenantFixture({ tenants: ['local-proof'], salesOrg: 'local-proof', seed: async owner => {
    await owner.query("INSERT INTO ll_members(org_id,email,name,password_hash) VALUES('local-proof','owner@example.test','Owner','unused')");
    await owner.query("INSERT INTO ll_sessions(hash,email,expires_at) VALUES($1,'owner@example.test',now()+interval '1 hour')", [digest(session)]);
  } });
  let child: ChildProcess | undefined;
  try {
    child = launch(await fixture.publication('local-proof', 'web'));
    const origin = await ready(child);
    expect((await fetch(origin + '/api/durable/workflows')).status).toBe(401);
    const headers = { Cookie: `${WORKSPACE_COOKIE}=${session}`, Origin: origin.replace('127.0.0.1', 'localhost'), 'Content-Type': 'application/json' };
    const read = await fetch(origin + '/api/durable/workflows', { headers });
    expect(read.status).toBe(200); expect(await read.json()).toEqual([]);
    expect((await fetch(origin + '/api/durable/workflows', { method: 'POST', headers, body: JSON.stringify({ operation: 'create' }) })).status).toBe(400);
    for (const table of ['ll_workflow_runs', 'll_connector_actions']) {
      expect((await fixture.owner.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0);
    }
    await stopProofChild(child);
    const current = (await fixture.owner.query("SELECT epoch::text FROM ll_workspace_recovery WHERE org_id='local-proof'")).rows[0].epoch;
    child = launch(await fixture.publication('local-proof', 'web'), { org: 'local-proof', epoch: current });
    expect((await fetch((await ready(child)) + '/api/durable/workflows', { headers })).status).toBe(200);
    await stopProofChild(child);
    child = launch(await fixture.publication('local-proof', 'web'), { org: 'local-proof', epoch: randomUUID() });
    let staleOutput = '';
    child.stdout!.on('data', bytes => { staleOutput += String(bytes); });
    child.stderr!.resume();
    expect(await new Promise<number | null>((resolve, reject) => { child!.once('error', reject); child!.once('exit', resolve); })).toBe(1);
    expect(staleOutput).not.toContain('"port"');
  } finally { await stopProofChild(child); await fixture.close(); }
}, 30000);
