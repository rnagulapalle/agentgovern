import { afterAll,beforeAll,expect,test,vi } from 'vitest';
import { randomBytes,randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { createInstalledTenantFixture } from '../lib/workspace/installed-tenant-fixture';
import { configureTenantContext } from '../lib/workspace/tenant-context';
import { digest,WORKSPACE_COOKIE } from '../lib/workspace/identity';
import { POST } from '../app/api/workspace/enquiries/route';
import { browserOrigin,sameOrigin } from '../lib/durable/http';
let fixture:Awaited<ReturnType<typeof createInstalledTenantFixture>>;
const session=randomBytes(32).toString('base64url'),legacyNamed=randomBytes(32).toString('base64url'),legacyUnnamed=randomBytes(32).toString('base64url');
beforeAll(async()=>{
 fixture=await createInstalledTenantFixture({tenants:['local-proof'],salesOrg:'local-proof',seed:async owner=>{
  await owner.query("INSERT INTO ll_members(org_id,email,name,password_hash) VALUES('local-proof','owner@example.test','Owner','unused')");
  await owner.query("INSERT INTO ll_sessions(hash,email,expires_at) VALUES($1,'owner@example.test',now()+interval '1 hour')",[digest(session)]);
  await owner.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'local-proof','owner@example.test','operator'),($2,'local-proof','retained-legacy-operator','operator')",[digest(legacyNamed),digest(legacyUnnamed)]);
  await owner.query("INSERT INTO ll_connector_policies(org_id,connector) VALUES('local-proof','crm'),('local-proof','email')");
 }});configureTenantContext(fixture.context);vi.stubEnv('LOOPLABS_DURABLE_ORIGIN','');vi.stubEnv('LOOPLABS_CONNECTOR_TWIN_URL','http://127.0.0.1:8018');vi.stubEnv('LOOPLABS_CONNECTOR_TWIN_TOKEN',randomBytes(32).toString('base64url'));
},30000);
afterAll(async()=>{vi.unstubAllEnvs();await fixture?.close();},30000);
function request(key:string,cookie:boolean,origin='http://localhost:45000'){
 return new NextRequest('http://127.0.0.1:45000/api/workspace/enquiries',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...cookie?{Cookie:`${WORKSPACE_COOKIE}=${key}`}:{Authorization:`Bearer ${key}`}},body:JSON.stringify({operation:'prepare',id:randomUUID(),fixtureId:'missing'})});
}
test('genuine installed named session prepares clarification; legacy token for the same named subject is exactly401 before effects',async()=>{
 const reads=vi.spyOn(globalThis,'fetch');
 try{
  expect((await fixture.context.member(session)).actor.subject).toBe('owner@example.test');
  await expect(fixture.context.authenticated(legacyNamed)).rejects.toMatchObject({status:401});
  expect((await fixture.context.authenticated(legacyUnnamed)).actor.subject).toBe('retained-legacy-operator');
  const refused=await POST(request(legacyNamed,false));expect(refused.status).toBe(401);
  const admitted=await POST(request(session,true));expect(admitted.status).toBe(200);expect(await admitted.json()).toHaveProperty('clarification');
  expect(reads).not.toHaveBeenCalled();
  for(const table of ['ll_enquiry_plans','ll_workflow_runs','ll_connector_actions'])expect((await fixture.owner.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0);
 }finally{reads.mockRestore();}
});
test('actual NextRequest loopback normalization retains correct same-origin behavior and rejects a different origin exactly403',async()=>{
 const r=request(session,true);expect(r.url).toBe('http://localhost:45000/api/workspace/enquiries');expect(browserOrigin(r)).toBe('http://localhost:45000');expect(()=>sameOrigin(r)).not.toThrow();
 expect((await POST(request(session,true,'http://localhost:45001'))).status).toBe(403);
 expect((await fixture.owner.query('SELECT count(*)::int n FROM ll_enquiry_plans')).rows[0].n).toBe(0);
});
