import {beforeAll,afterAll,beforeEach,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {createInstalledTenantFixture} from '../workspace/installed-tenant-fixture';
import {digest} from '../workspace/identity';
import {transaction} from '../durable/database';
import {EnquiryControl} from './service';
import {ConnectorControl} from '../connectors/service';
import {WorkflowControl} from '../workflows/service';
import type {Actor} from '../durable/contracts';
let installed:Awaited<ReturnType<typeof createInstalledTenantFixture>>,service:EnquiryControl,actor:Actor;
const token=randomBytes(32).toString('base64url');
beforeAll(async()=>{
 installed=await createInstalledTenantFixture({tenants:['required-pair'],salesOrg:'required-pair',seed:async owner=>{await owner.query("INSERT INTO ll_members(email,org_id,name,password_hash)VALUES('required-pair@example.test','required-pair','Policy owner','unused')");await owner.query("INSERT INTO ll_sessions(hash,email,expires_at)VALUES($1,'required-pair@example.test',now()+interval '1 hour')",[digest(token)]);}});
 // Existing released quote connector migration, not a fabricated schema.
 await installed.owner.query(await readFile('lib/connectors/quote-action-schema.sql','utf8'));
 const named=await installed.context.member(token);actor=named.actor;
 const provider={workspaceId:actor.orgId,bindingId:'a'.repeat(64),source:async()=>null,write:async()=>{throw Error('No provider effects permitted in policy-only proof');},inspect:async()=>{throw Error('No provider effects permitted in policy-only proof');}};
 service=new EnquiryControl(named.db,new WorkflowControl(named.db,new ConnectorControl(named.db,provider)),async()=>({id:'1',email:'customer@example.test',version:'v1',lifecycle:'lead'}));
});
beforeEach(async()=>{await installed.owner.query("DELETE FROM ll_connector_policies WHERE org_id='required-pair'");await installed.owner.query("INSERT INTO ll_connector_policies(org_id,connector,version)VALUES('required-pair','crm',1),('required-pair','email',3),('required-pair','quote',3)");});
afterAll(async()=>{await installed?.close();});
const policies=()=>transaction(service.db,actor.orgId,c=>service.policies(c,actor));
it('actual installed SQL selects required CRM/email despite active quote and performs no effects',async()=>{expect(await policies()).toEqual({crm:1,email:3});expect((await installed.owner.query("SELECT connector,version,active FROM ll_connector_policies WHERE org_id='required-pair' ORDER BY connector")).rows).toEqual([{connector:'crm',version:1,active:true},{connector:'email',version:3,active:true},{connector:'quote',version:3,active:true}]);expect((await installed.owner.query('SELECT count(*)::int n FROM ll_connector_actions')).rows[0].n).toBe(0);});
it.each(['crm','email'])('actual SQL refuses missing/inactive required %s despite quote availability',async connector=>{await installed.owner.query("UPDATE ll_connector_policies SET active=false WHERE org_id='required-pair' AND connector=$1",[connector]);await expect(policies()).rejects.toMatchObject({status:409});await installed.owner.query("DELETE FROM ll_connector_policies WHERE org_id='required-pair' AND connector=$1",[connector]);await expect(policies()).rejects.toMatchObject({status:409});});
it('actual SQL refuses duplicate required connector without changing current pair',async()=>{await expect(installed.owner.query("INSERT INTO ll_connector_policies(org_id,connector,version)VALUES('required-pair','crm',1)")).rejects.toMatchObject({code:'23505'});expect(await policies()).toEqual({crm:1,email:3});});
