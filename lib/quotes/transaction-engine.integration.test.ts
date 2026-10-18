/** Actual installed SQL/state machine plus labelled provider-read doubles.
 * No HTTP/TLS provider conformance or execution is claimed by these tests. */
import {expect,it,vi} from 'vitest';
import {setupQuoteDemoFixture} from '../connectors/quote-demo.test-fixture';
import {QuoteTransactionContext} from './transaction-context';
import {QuoteActionBoundary} from '../connectors/quote-action';
import {ConnectorControl} from '../connectors/service';
import {NativeQuoteConnector} from '../connectors/native-quote';
import {NativeQuoteMailConnector} from '../connectors/native-quote-mail';
import {NativeQuoteEmailTransport} from './native-email-transport';
import {assertTenantPool} from '../durable/tenant-pool';
import type {PoolClient} from 'pg';

it('existing propose/review scopes early native predecessor hooks and fresh loaders to the exact real installed transaction',async()=>{
 const f=await setupQuoteDemoFixture();
 try{
  const saved=await f.save();if(saved.plan.version!=='distributor-quote-plan-2')throw Error('Bound plan required');
  const scope=new QuoteTransactionContext(f.web);let currentClient:PoolClient|undefined;let hooks=0;
  const hook=async()=>{await Promise.resolve();const c=await scope.connection();expect(c).not.toBe(f.web);await assertTenantPool(c,'one');await c.query("SELECT id FROM ll_orgs WHERE id='one' FOR UPDATE");currentClient=c as PoolClient;hooks++;return null;};
  const native=new NativeQuoteConnector({origin:'https://native.example.test',workspaceId:'one',quoteId:'quote-42',quoteBinding:saved.plan.authority.quoteBinding,emailBinding:saved.plan.authority.emailBinding},async()=>{throw Error('No network permitted');},1500,{https:{mode:'verified-tls',trust:'standard'},assertGeneration:async()=>{await hook();}});
  // This double drives the real NativeQuoteMailConnector.predecessor path,
  // before QuoteActionBoundary.current(), preserving its concrete type checks.
  const lookup=vi.spyOn(native.transport,'lookup').mockImplementation(async()=>{await hook();return null;});
  const transport={request:vi.fn(async()=>{throw Error('No network permitted');})};
  const pin={quoteRequest:saved.plan.update.request,messageRequest:saved.plan.message.request};
  const provider=new NativeQuoteMailConnector(native,pin,new NativeQuoteEmailTransport(pin,native.transport,transport));
  const boundary=new QuoteActionBoundary(f.web,f.authority,async(c,actor,plan)=>{
   expect(await scope.connection()).toBe(c);if(currentClient)expect(currentClient).toBe(c);
   await Promise.resolve();return {contract:'quote-plan-context-2',pricing:structuredClone(f.pricing),authority:await f.authority.currentSavedPlanAuthority(actor,plan.planId,c)};
  },undefined,scope);
  const control=new ConnectorControl(f.web,provider,boundary);
  const action=await control.proposeQuote(f.owner,saved.id,saved.planHash,'message');expect(action.state).toBe('held');
  currentClient=undefined;await expect(control.review(f.owner,action.id,action.payload_hash,true)).rejects.toMatchObject({status:403});
  currentClient=undefined;expect((await control.review(f.manager,action.id,action.payload_hash,true)).state).toBe('ready');
  expect(lookup).toHaveBeenCalled();expect(hooks).toBeGreaterThanOrEqual(3);expect(transport.request).not.toHaveBeenCalled();
  expect(await scope.connection()).toBe(f.web);
 }finally{await f.installed.close();}
},20000);

it('propose/review refuse scope identity misuse and source drift without new admission or approval',async()=>{
 const f=await setupQuoteDemoFixture();
 try{
  const saved=await f.save(),scope=new QuoteTransactionContext(f.web);let mode:'normal'|'foreign'|'source'='normal';
  const boundary=new QuoteActionBoundary(f.web,f.authority,async(c,actor,plan)=>{
   if(mode==='foreign')await scope.run(c,{...actor,tokenHash:'different-session'},async()=>null);
   const pricing=structuredClone(f.pricing);if(mode==='source')pricing.quote.sourceVersion='v4';
   return {contract:'quote-plan-context-2',pricing,authority:await f.authority.currentSavedPlanAuthority(actor,plan.planId,c)};
  },undefined,scope);
  const control=new ConnectorControl(f.web,f.quoteProvider,boundary);
  mode='foreign';await expect(control.proposeQuote(f.owner,saved.id,saved.planHash,'update')).rejects.toMatchObject({status:403});
  expect((await f.installed.owner.query('SELECT count(*) n FROM ll_connector_actions')).rows[0].n).toBe('0');
  mode='normal';const action=await control.proposeQuote(f.owner,saved.id,saved.planHash,'update');
  mode='source';await expect(control.review(f.manager,action.id,action.payload_hash,true)).rejects.toMatchObject({status:409});
  mode='foreign';await expect(control.review(f.manager,action.id,action.payload_hash,true)).rejects.toMatchObject({status:403});
  expect((await control.read(f.owner,action.id))).toMatchObject({state:'held',approved_by:null});
  expect(f.quoteProvider.write).not.toHaveBeenCalled();
 }finally{await f.installed.close();}
},20000);
