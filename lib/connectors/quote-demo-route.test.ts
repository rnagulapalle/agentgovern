import {expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {QuotePlanContextV2} from '../quotes/plan-v2';

import {setupQuoteDemoFixture as setup} from './quote-demo.test-fixture';
async function fixture(run:(f:Awaited<ReturnType<typeof setup>>)=>Promise<void>){const f=await setup();try{await run(f);}finally{vi.unstubAllEnvs();await f.installed.close();}}


import { NextRequest } from 'next/server';
import { configureTenantContext } from '../workspace/tenant-context';
import { WORKSPACE_COOKIE } from '../workspace/identity';
import { POST } from '../../app/api/workspace/quotes/route';
import { GET as SETUP } from '../../app/api/workspace/quotes/setup/route';
import { QuoteDemoControl } from '../quotes/demo-control';
import { configureQuoteDemo,quoteDemo } from '../quotes/demo-registry';
it('actual installed quote API uses labelled planner double and real saved-plan/action authority without external execution',async()=>fixture(async f=>{
 configureTenantContext(f.installed.context);await f.prepare();
 for(const agent of ['quote-agent','message-agent'])await f.installed.owner.query('INSERT INTO ll_connector_scope_grants(org_id,scope_id,agent_id,created_by) VALUES($1,$2,$3,$4)',['one',f.scope,agent,f.owner.subject]);
 let next:unknown={job:'quote-discount',discountBps:1400};const planner={interpret:vi.fn(async(turns:unknown)=>{void turns;return structuredClone(next);})};const factory=vi.fn(async()=>({quote:f.control,message:f.emailControl,workflow:f.workflow}));
 const observationFactory=vi.fn(async()=>({quote:f.control,message:f.emailControl,workflow:f.workflow}));
 const control=new QuoteDemoControl(f.web,f.scope,{store:f.store,planner,observeControllers:observationFactory,context:async(c,a)=>await f.loader(c,a,{quoteId:'quote-42',distributorId:'distributor-7'}) as QuotePlanContextV2,controllers:factory});
 configureQuoteDemo(control);expect(()=>configureQuoteDemo(control)).toThrow('immutable');const facade=quoteDemo(f.web,f.scope);expect(facade===control).toBe(false);expect(quoteDemo(f.web,f.scope)===facade).toBe(true);expect(facade.db).toBe(f.web);expect(facade.scopeId).toBe(f.scope);const resolveForward=vi.spyOn(control,'resolve').mockResolvedValueOnce({forwarded:true} as never);expect(await facade.resolve(f.owner,randomUUID())).toEqual({forwarded:true});expect(resolveForward).toHaveBeenCalledTimes(1);resolveForward.mockRestore();expect(()=>quoteDemo(f.web,randomUUID())).toThrow('not configured');
 const setupRequest=(token:string,query='',origin='https://looplabs.run')=>new NextRequest('https://looplabs.run/api/workspace/quotes/setup'+query,{headers:{origin,cookie:WORKSPACE_COOKIE+'='+token}});
 expect((await SETUP(setupRequest(''))).status).toBe(401);
 expect((await SETUP(setupRequest(f.keys.owner,'?scope='+f.scope))).status).toBe(400);
 expect((await SETUP(setupRequest(f.keys.owner,'','https://other.example'))).status).toBe(403);
 const ownerCatalog=await SETUP(setupRequest(f.keys.owner));expect(ownerCatalog.status).toBe(200);expect(ownerCatalog.headers.get('cache-control')).toBe('no-store');expect(await ownerCatalog.json()).toEqual({viewer:f.owner.subject,available:true,scopes:[{id:f.scope,quoteId:'quote-42',distributorId:'distributor-7',manager:f.manager.subject,canPrepare:true,plans:[]}]});
 expect((await (await SETUP(setupRequest(f.keys.manager))).json()).scopes[0].canPrepare).toBe(false);
 for(const token of [f.keys.colleague,f.keys.foreign])expect((await (await SETUP(setupRequest(token))).json()).scopes).toEqual([]);
 expect(factory).not.toHaveBeenCalled();expect(planner.interpret).not.toHaveBeenCalled();
 const id=randomUUID(),request=(token:string,p:unknown,query='?scope='+f.scope,origin='https://looplabs.run')=>new NextRequest('https://looplabs.run/api/workspace/quotes'+query,{method:'POST',headers:{origin,'content-type':'application/json',cookie:WORKSPACE_COOKIE+'='+token},body:JSON.stringify(p)});
 const prepare={operation:'prepare',id,turns:[{role:'user',text:'Offer this distributor a 14% discount and prepare the customer confirmation for manager approval.'}]};
 expect((await POST(request('',prepare))).status).toBe(401);
 expect((await POST(request(f.keys.owner,prepare,'?scope='+f.scope,'https://other.example'))).status).toBe(403);
 for(const p of [{...prepare,binding:'forged'},{...prepare,id:'bad'},{operation:'execute',id},{...prepare,operation:'chat'}])expect((await POST(request(f.keys.owner,p))).status).toBe(400);
 for(const q of ['', '?scope='+f.scope+'&scope='+f.scope,'?org=one','?scope=bad'])expect((await POST(request(f.keys.owner,prepare,q))).status).toBe(400);
 expect((await POST(request(f.keys.owner,prepare,'?scope='+randomUUID()))).status).toBe(403);
 expect((await POST(request(f.keys.foreign,prepare))).status).toBe(403);
 const unsupportedScope=randomUUID();await f.installed.owner.query("INSERT INTO ll_connector_scopes(org_id,id,contact_id,recipient,binding_id,contract_version,created_by,quote_id,distributor_id,email_binding_id,sender) SELECT org_id,$1,contact_id,recipient,repeat('f',64),contract_version,created_by,quote_id,distributor_id,email_binding_id,sender FROM ll_connector_scopes WHERE org_id='one' AND id=$2",[unsupportedScope,f.scope]);expect((await POST(request(f.keys.owner,prepare,'?scope='+unsupportedScope))).status).toBe(503);
 const initial=await POST(request(f.keys.owner,prepare));expect(initial.status).toBe(200);expect(initial.headers.get('cache-control')).toBe('no-store');const saved=(await initial.json()).saved;
 expect((await (await SETUP(setupRequest(f.keys.owner))).json()).scopes[0].plans.map((p:{id:string})=>p.id)).toEqual([id]);expect((await (await SETUP(setupRequest(f.keys.manager))).json()).scopes[0].plans.map((p:{id:string})=>p.id)).toEqual([id]);
 expect(saved.plan.discountBps).toBe(1400);expect(saved.plan.totalMinor).toBe(86000);expect(saved.plan.approver).toBe(f.manager.subject);expect(saved.plan.message.request.body.to).toEqual(['buyer@example.test']);
 expect((await POST(request(f.keys.owner,prepare))).status).toBe(200);expect((await f.installed.owner.query('SELECT count(*)::int n FROM ll_quote_plans')).rows[0].n).toBe(1);
 expect((await f.installed.owner.query('SELECT count(*)::int n FROM ll_connector_actions')).rows[0].n).toBe(0);expect(factory).not.toHaveBeenCalled();
 const resolved=await POST(request(f.keys.owner,{operation:'resolve',id}));expect(resolved.status).toBe(200);const observed=await resolved.json();expect(observed.run).toBeNull();expect(observed.actions).toEqual([]);expect(observed.completion).toBe('not-established');expect(factory).not.toHaveBeenCalled();
 expect((await POST(request(f.keys.colleague,{operation:'resolve',id}))).status).toBe(404);
 expect((await POST(request(f.keys.manager,{operation:'submit',id,planHash:saved.planHash}))).status).toBe(403);
 expect((await POST(request(f.keys.owner,{operation:'submit',id,planHash:'c'.repeat(64)}))).status).toBe(409);
 const submit={operation:'submit',id,planHash:saved.planHash};
 await f.installed.owner.query("UPDATE ll_connector_scope_grants SET active=false,version=version+1 WHERE agent_id='message-agent'");
 const partial=await POST(request(f.keys.owner,submit));expect(partial.status).toBe(200);const retained=await partial.json();expect(retained.submission).toBe('partial-recorded');expect(retained.actions).toHaveLength(1);expect(retained.actions[0].state).toBe('held');expect(retained.completion).toBe('not-established');
 expect((await f.installed.owner.query('SELECT reserved FROM ll_agents ORDER BY id')).rows.map(x=>x.reserved)).toEqual([0,1]);
 await f.installed.owner.query("UPDATE ll_connector_scope_grants SET active=true,version=version+1 WHERE agent_id='message-agent'");
 const recovered=await POST(request(f.keys.owner,submit));expect(recovered.status).toBe(200);expect((await recovered.json()).submission).toBe('actions-recorded');expect((await POST(request(f.keys.owner,submit))).status).toBe(200);
 expect((await f.installed.owner.query('SELECT count(*)::int n FROM ll_connector_actions')).rows[0].n).toBe(2);expect((await f.installed.owner.query('SELECT reserved FROM ll_agents ORDER BY id')).rows.map(x=>x.reserved)).toEqual([1,1]);
 const actions=(await (await POST(request(f.keys.manager,{operation:'resolve',id}))).json()).actions;
 const update=actions.find((a:{connector:string})=>a.connector==='quote');const review={operation:'review',id,planHash:saved.planHash,step:'update',payloadHash:update.payload_hash,approve:true};
 expect((await POST(request(f.keys.owner,review))).status).toBe(403);expect((await POST(request(f.keys.colleague,review))).status).toBe(404);expect((await POST(request(f.keys.manager,{...review,payloadHash:'d'.repeat(64)}))).status).toBe(409);
 expect((await POST(request(f.keys.manager,review))).status).toBe(200);expect((await POST(request(f.keys.manager,review))).status).toBe(200);
 // Metadata-only test providers must not become eligible execution adapters.
 expect((await POST(request(f.keys.owner,{operation:'advance',id,planHash:saved.planHash,step:'update'}))).status).toBe(503);
 expect((await POST(request(f.keys.owner,{operation:'verify',id,planHash:saved.planHash}))).status).toBe(409);
 const before=planner.interpret.mock.calls.length;expect((await POST(request(f.keys.owner,{...prepare,id:randomUUID(),turns:[{role:'user',text:'ASIAABCDEFGHIJKLMNOP'}]}))).status).toBe(400);expect(planner.interpret.mock.calls.length).toBe(before);
 next={job:'quote-discount',discountBps:null};const clarification=await POST(request(f.keys.owner,{...prepare,id:randomUUID()}));expect(clarification.status).toBe(200);expect((await clarification.json()).saved).toBeNull();
 next={job:'quote-discount',discountBps:1400};const clarifiedId=randomUUID();const clarifiedTurns=[{role:'user',text:'Prepare the distributor quote for manager review.'},{role:'user',text:'14%'}];const clarified=await POST(request(f.keys.owner,{...prepare,id:clarifiedId,turns:clarifiedTurns}));expect(clarified.status).toBe(200);expect((await clarified.json()).saved.plan.discountBps).toBe(1400);expect(planner.interpret.mock.calls.at(-1)?.[0]).toEqual(clarifiedTurns);
 next={job:'unsupported',discountBps:null};expect((await POST(request(f.keys.owner,{...prepare,id:randomUUID()}))).status).toBe(400);
 next={job:'quote-discount',discountBps:1400,approver:'forged'};expect((await POST(request(f.keys.owner,{...prepare,id:randomUUID()}))).status).toBe(503);
 next={job:'quote-discount',discountBps:1500};expect((await POST(request(f.keys.owner,prepare))).status).toBe(409);

 // Failure cases exercise actual installed authority before any provider effect.
 await expect(control.prepare(f.owner,'invalid',prepare.turns)).rejects.toMatchObject({status:400});
 await expect(control.review(f.owner,id,saved.planHash,'invalid' as 'update','a'.repeat(64),true)).rejects.toMatchObject({status:400});
 await expect(control.advance(f.owner,id,saved.planHash,'invalid' as 'update')).rejects.toMatchObject({status:400});
 await expect(control.submit(f.owner,id,'invalid')).rejects.toMatchObject({status:400});
 expect(()=>new QuoteDemoControl(f.installed.owner,f.scope,{store:f.store,planner,context:async()=>{throw Error('No context')},controllers:factory})).toThrow('share');
 for(const bad of [{job:'quote-discount',discountBps:'14'}, {job:'quote-discount',discountBps:10001},{job:'unsupported'},null]){next=bad;await expect(control.prepare(f.owner,randomUUID(),prepare.turns)).rejects.toMatchObject({status:503});}
 next={job:'quote-discount',discountBps:1400};
 const dependencies={store:f.store,planner,controllers:factory,context:async(c:import('pg').PoolClient,a:import('../durable/contracts').Actor)=>await f.loader(c,a,{quoteId:'quote-42',distributorId:'distributor-7'}) as QuotePlanContextV2};
 const wrongScope=new QuoteDemoControl(f.web,randomUUID(),dependencies);await expect(wrongScope.resolve(f.owner,id)).rejects.toMatchObject({status:404});await expect(wrongScope.prepare(f.owner,randomUUID(),prepare.turns)).rejects.toMatchObject({status:403});
 const ambiguous=new QuoteDemoControl(f.web,f.scope,{...dependencies,context:async(c,a)=>{const context=await dependencies.context(c,a);return {...context,pricing:{...context.pricing,agents:[...context.pricing.agents,context.pricing.agents[0]]}};}});await expect(ambiguous.prepare(f.owner,randomUUID(),prepare.turns)).rejects.toMatchObject({status:409});
 const wrongFactory=new QuoteDemoControl(f.web,f.scope,{...dependencies,controllers:async()=>({quote:f.emailControl,message:f.control,workflow:f.workflow})});await expect(wrongFactory.submit(f.owner,id,saved.planHash)).rejects.toMatchObject({status:503});
 expect((await POST(request(f.keys.owner,{operation:'advance',id,planHash:saved.planHash,step:'invalid'}))).status).toBe(400);
 expect((await POST(request(f.keys.owner,{...review,approve:'yes'}))).status).toBe(400);
 const cross=request(f.keys.owner,{operation:'resolve',id});cross.headers.set('sec-fetch-site','cross-site');expect((await POST(cross)).status).toBe(403);
 await f.installed.owner.query('UPDATE ll_members SET active=false WHERE email=$1',[f.manager.subject]);await f.installed.owner.query('UPDATE ll_members SET active=true WHERE email=$1',[f.manager.subject]);
 expect((await POST(request(f.keys.owner,{operation:'resolve',id}))).status).toBe(409);expect((await POST(request(f.keys.manager,review))).status).toBe(409);expect((await SETUP(setupRequest(f.keys.owner))).status).toBe(503);expect((await (await SETUP(setupRequest(f.keys.manager))).json()).scopes).toEqual([]);
 for(const p of [f.quoteProvider,f.emailProvider]){expect(p.write).not.toHaveBeenCalled();expect(p.inspect).not.toHaveBeenCalled();expect(p.source).not.toHaveBeenCalled();}
}),10000);
