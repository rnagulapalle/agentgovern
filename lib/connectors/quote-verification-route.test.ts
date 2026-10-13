import {expect,it,vi} from 'vitest';
import {setupQuoteDemoFixture as setup} from './quote-demo.test-fixture';
import {NextRequest} from 'next/server';
import {configureTenantContext} from '../workspace/tenant-context';
import {WORKSPACE_COOKIE} from '../workspace/identity';
import {GET as VERIFICATION} from '../../app/api/workspace/quotes/verification/route';
import {QuoteDemoControl} from '../quotes/demo-control';
import {configureQuoteDemo} from '../quotes/demo-registry';
import type {QuotePlanContextV2} from '../quotes/plan-v2';
async function fixture(run:(f:Awaited<ReturnType<typeof setup>>)=>Promise<void>){const f=await setup();try{await run(f);}finally{vi.unstubAllEnvs();await f.installed.close();}}

it('actual installed readonly verification uses only observation factory and preserves tenant/identity/origin/exacthash boundaries',async()=>fixture(async f=>{
 configureTenantContext(f.installed.context);const saved=await f.save(),id=saved.id;await f.workflow.createQuote(f.owner,id);
 const planner={interpret:vi.fn(async()=>({job:'unsupported',discountBps:null}))},factory=vi.fn(async()=>({quote:f.control,message:f.emailControl,workflow:f.workflow})),observationFactory=vi.fn(async()=>({quote:f.control,message:f.emailControl,workflow:f.workflow}));
 const control=new QuoteDemoControl(f.web,f.scope,{store:f.store,planner,controllers:factory,observeControllers:observationFactory,context:async(c,a)=>await f.loader(c,a,{quoteId:'quote-42',distributorId:'distributor-7'}) as QuotePlanContextV2});configureQuoteDemo(control);
 const verificationRequest=(token:string,extra='',origin='https://looplabs.run')=>new NextRequest('https://looplabs.run/api/workspace/quotes/verification?'+new URLSearchParams({scope:f.scope,id,planHash:saved.planHash})+extra,{headers:{origin,cookie:WORKSPACE_COOKIE+'='+token}});
 const mutationsBefore=factory.mock.calls.length,eventsBefore=(await f.installed.owner.query('SELECT count(*) n FROM ll_workflow_events')).rows[0].n;
 for(const key of [f.keys.owner,f.keys.manager]){const response=await VERIFICATION(verificationRequest(key));expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');expect(await response.json()).toMatchObject({historical:null,current:{outcome:'unknown'}});}
 expect(observationFactory).toHaveBeenCalledTimes(2);expect(factory.mock.calls.length).toBe(mutationsBefore);expect((await f.installed.owner.query('SELECT count(*) n FROM ll_workflow_events')).rows[0].n).toBe(eventsBefore);expect(f.quoteProvider.write).not.toHaveBeenCalled();expect(f.emailProvider.write).not.toHaveBeenCalled();
 expect((await VERIFICATION(verificationRequest(f.keys.owner,'&scope='+f.scope))).status).toBe(400);expect((await VERIFICATION(verificationRequest(f.keys.owner,'&owner=forged'))).status).toBe(400);expect((await VERIFICATION(verificationRequest(f.keys.owner,'','https://foreign.test'))).status).toBe(403);expect((await VERIFICATION(verificationRequest(f.keys.colleague))).status).toBe(404);expect((await VERIFICATION(verificationRequest(f.keys.foreign))).status).toBe(503);expect((await VERIFICATION(verificationRequest(''))).status).toBe(401);
 const wrongHash=verificationRequest(f.keys.owner);wrongHash.nextUrl.searchParams.set('planHash','d'.repeat(64));expect((await VERIFICATION(wrongHash)).status).toBe(409);expect(observationFactory).toHaveBeenCalledTimes(2);

 const unconfigured=new QuoteDemoControl(f.web,f.scope,{store:f.store,planner,controllers:factory,context:async()=>{throw Error('No context on readonly path');}});await expect(unconfigured.verification(f.owner,id,saved.planHash)).rejects.toMatchObject({status:503});expect(factory.mock.calls.length).toBe(mutationsBefore);
 expect(planner.interpret).not.toHaveBeenCalled();
}));
