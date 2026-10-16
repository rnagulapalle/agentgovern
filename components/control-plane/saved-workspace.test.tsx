import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { chromium, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { SavedWorkspace, savedActionLabel, savedActionDestination, type SavedWorkspaceSection } from "./saved-workspace";
const requireModule = createRequire(import.meta.url);
const pricing = { agents: [], policy: { auto_limit: 15, hard_limit: 50, version: 2 }, actions: [{ id: "00112233-aaaa-4aaa-8aaa-aabbccddeeff", agent_id: "pricing-agent", state: "held", discount: 25 }] };
const connectors = { actions: [{ id: "source-uncertain", agent_id: "crm-agent", connector: "crm", state: "uncertain" }], policies: [{ connector: "crm", active: true, version: 1 }, { connector: "email", active: false, version: 2 }] };
it('readable labels preserve exact immutable destinations without showing UUIDs as names', () => {
 expect(savedActionLabel(pricing.actions[0])).toBe('25% pricing request');
 expect(savedActionLabel(connectors.actions[0])).toBe('Customer record update');
 expect(savedActionLabel({connector:'email'})).toBe('Customer acknowledgement');
 expect(savedActionDestination(pricing.actions[0])).toBe('/control-plane/actions?workflow=discounts#action-00112233-aaaa-4aaa-8aaa-aabbccddeeff');
 expect(savedActionDestination({id:'a/#?',connector:'email'})).toBe('/control-plane/actions?workflow=email#action-a%2F%23%3F');
});
it.each(['overview','workflows','approvals','policies','connections','outputs','reconciliation'] as const)('initial %s view does not invent counts, cloud connectivity or refund availability', section => {
 const h=renderToStaticMarkup(<SavedWorkspace section={section}/>);
 expect(h).toContain('Sample records and isolated simulated systems');expect(h).not.toContain('workflow=refunds');expect(h).not.toContain('No held requests');expect(h).not.toContain('No unresolved requests');
 if(section==='connections'){expect(h).toContain('Coming soon');expect(h).not.toContain('href="/control-plane/discovery"');}
});
async function mounted(section:SavedWorkspaceSection,run:(page:Page,requests:string[])=>Promise<void>,failure?:'pricing'|'connectors'|'malformed'|'unknown-state'|'mixed-quote'|'unknown-connector',deferred?:Promise<void>){
 const esbuild=requireModule(requireModule.resolve('esbuild',{paths:[requireModule.resolve('@temporalio/worker')]}));
 const result=await esbuild.build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {SavedWorkspace} from './components/control-plane/saved-workspace';createRoot(document.getElementById('app')).render(<SavedWorkspace section="${section}"/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'browser',format:'iife',outfile:'memory/workspace.js',write:false,jsx:'automatic',alias:{'@':resolve('.')},define:{'process.env':'{}','process.env.NODE_ENV':'"test"'}});
 const browser=await chromium.launch({headless:true});const requests:string[]=[];
 try{const page=await browser.newPage();await page.route('https://workspace-owned.test/**',async route=>{
  const p=new URL(route.request().url()).pathname;
  if(p==='/')return route.fulfill({contentType:'text/html',body:'<div id="app"></div>'});
  if(deferred)await deferred;
  requests.push(route.request().method()+' '+p);
  const denied=(failure==='pricing'&&p==='/api/durable')||(failure==='connectors'&&p==='/api/durable/connectors');
  return route.fulfill({status:denied?403:200,contentType:'application/json',body:JSON.stringify(denied?{error:'Current access refused.'}:failure==='malformed'?{actions:'unknown'}:failure==='unknown-state'?{...pricing,actions:[{...pricing.actions[0],state:'new-unknown-state'}]}:p==='/api/durable'?pricing:failure==='unknown-connector'?{...connectors,actions:[{...connectors.actions[0],connector:'future-unknown'}]}:failure==='mixed-quote'?{...connectors,actions:[...connectors.actions,{id:'quote-update-held',agent_id:'quote-agent',connector:'quote',state:'held',payload:{contract:'quote-step-1'}},{id:'quote-email-held',agent_id:'quote-mail-agent',connector:'email',state:'held',payload:{contract:'quote-step-1'}},{id:'customer-email-held',agent_id:'customer-mail-agent',connector:'email',state:'held',payload:{template:'case_received'}}],policies:[...connectors.policies,{connector:'quote',active:true,version:1}]}:connectors)});
 });await page.goto('https://workspace-owned.test/');await page.addScriptTag({content:result.outputFiles.find((x:{path:string})=>x.path.endsWith('.js'))?.text||result.outputFiles[0].text});await run(page,requests);}finally{await browser.close();}
}
it('mounted overview uses only installed read APIs and preserves exact-action deep links',async()=>mounted('overview',async(page,requests)=>{
 await page.getByRole('heading',{name:'25% pricing request'}).waitFor();await page.getByRole('heading',{name:'Customer record update'}).waitFor();
 expect(await page.getByRole('link',{name:'Review request'}).getAttribute('href')).toContain('#action-'+pricing.actions[0].id);
 expect(await page.getByRole('link',{name:'View outcome',exact:true}).getAttribute('href')).toContain('workflow=crm#action-source-uncertain');
 await page.getByRole('button',{name:'Refresh saved status'}).click();await page.getByRole('heading',{name:'25% pricing request'}).waitFor();
 expect(await page.getByText('Showing up to the latest 100 pricing actions and the customer actions within the latest 100 connector actions. Quote-plan actions are reviewed separately. Older pending work may be outside this view.').count()).toBe(2);
 expect(requests).toEqual(['GET /api/durable','GET /api/durable/connectors','GET /api/durable','GET /api/durable/connectors']);
}),15000);
it.each(['pricing','connectors'] as const)('mounted %s failure preserves a partial queue rather than claiming no work',async failure=>mounted('overview',async page=>{
 await page.getByRole('alert').waitFor();expect(await page.getByText('Available rows are a partial view. Other requests may still need attention.').count()).toBe(1);
 expect(await page.getByText('No held requests',{exact:false}).count()).toBe(0);expect(await page.getByText('No unresolved requests',{exact:false}).count()).toBe(0);
 await page.getByRole('heading',{name:failure==='pricing'?'Customer record update':'25% pricing request'}).waitFor();
},failure),15000);
it('malformed snapshots are unknown, not empty successful queues',async()=>mounted('approvals',async page=>{
 await page.getByRole('alert').first().waitFor();expect(await page.getByText('The recent action view could not be confirmed.',{exact:false}).count()).toBe(1);expect(await page.getByRole('link',{name:'Review request'}).count()).toBe(0);
},'malformed'),15000);
it('connection view does not equate policy availability with live provider health',async()=>mounted('connections',async(page,requests)=>{
 await page.getByText('Sample requests are enabled. Connection health and real delivery have not been checked.').waitFor();
 expect(await page.getByText('An active request policy has not been confirmed.').count()).toBe(1);expect(await page.getByText('Coming soon').count()).toBe(3);
 expect(requests.every(r=>r.startsWith('GET '))).toBe(true);
}),15000);

it("unknown action states do not become a successful empty queue",async()=>mounted("overview",async page=>{await page.getByRole("alert").first().waitFor();expect(await page.getByText("No held requests",{exact:false}).count()).toBe(0);expect(await page.getByRole("link",{name:"Review request"}).count()).toBe(0);},"unknown-state"),15000);

it('policies retains administrator boundaries without repeating the capability overview',()=>{
 const h=renderToStaticMarkup(<SavedWorkspace section="policies"/>);
 for(const phrase of ['Workspace administrator','same server permissions apply to both named administrators','self-approval','bypass a hard limit','another workspace','unsupported action','Account invitations','cloud IAM administration','billing management'])expect(h).toContain(phrase);
 for(const route of ['discovery','work','settings','records','requests'])expect(h).not.toContain('href="/control-plane/'+route+'"');
 expect(h).not.toContain('Capabilities and availability');expect(h).not.toContain('super-admin');expect(h).not.toContain('type="submit"');
});
it('administrator boundaries remain visible when a saved API refuses access',async()=>mounted('policies',async(page,requests)=>{
 await page.getByRole('alert').waitFor();await page.getByRole('heading',{name:'Workspace administrator',exact:true}).waitFor();
 expect(await page.getByRole('heading',{name:'Capabilities and availability'}).count()).toBe(0);
 expect(requests.every(r=>r.startsWith('GET '))).toBe(true);
},'pricing'),15000);

it('known quote update and quote email are excluded from customer queue while actual customer rows survive',async()=>mounted('overview',async(page,requests)=>{
 await page.getByRole('heading',{name:'Customer record update',exact:true}).waitFor();await page.getByRole('heading',{name:'Customer acknowledgement',exact:true}).waitFor();
 expect(await page.getByRole('alert').count()).toBe(0);const hrefs=await page.getByRole('link',{name:'Review request'}).evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));expect(hrefs.some(h=>h?.includes('customer-email-held'))).toBe(true);expect(hrefs.some(h=>h?.includes('quote-email-held')||h?.includes('quote-update-held'))).toBe(false);expect(requests.every(r=>r.startsWith('GET '))).toBe(true);
},'mixed-quote'),15000);
it('mixed quote policy does not reject connections or claim quote health as customer health',async()=>mounted('connections',async page=>{
 await page.getByText('Sample requests are enabled. Connection health and real delivery have not been checked.').waitFor();expect(await page.getByRole('alert').count()).toBe(0);expect(await page.getByText('An active request policy has not been confirmed.').count()).toBe(1);
},'mixed-quote'),15000);
it('unknown connector still refuses data rather than displaying an empty or successful customer queue',async()=>mounted('overview',async page=>{
 await page.getByRole('alert').waitFor();expect(await page.getByText('No unresolved requests',{exact:false}).count()).toBe(0);expect(await page.getByRole('heading',{name:'Customer record update',exact:true}).count()).toBe(0);
},'unknown-connector'),15000);

it.each(['connections','policies'] as const)('loading %s is not reported as unavailable configuration',async section=>{
 let release!:()=>void;const deferred=new Promise<void>(resolve=>{release=resolve});
 try{await mounted(section,async page=>{
   await page.getByRole('button',{name:'Refresh saved status'}).waitFor();
   if(section==='connections')expect(await page.getByText('Loading configuration…',{exact:true}).count()).toBe(3);
   else await page.getByText('Loading pricing rules…',{exact:true}).waitFor();
   expect(await page.getByText('Configuration could not be confirmed. Refresh to try again.').count()).toBe(0);
   expect(await page.getByText('Current pricing policy is unavailable. Refresh to try again.').count()).toBe(0);
   release();
   if(section==='connections')await page.getByText('Sample pricing rules loaded.',{exact:false}).waitFor();
   else await page.getByText('Sample discount up to 15%',{exact:true}).waitFor();
 },undefined,deferred);}finally{release();}
},15000);

it('explicit AWS installation shows a setup link without claiming controlled execution or enabling other clouds', () => {
 const html=renderToStaticMarkup(<SavedWorkspace section="connections" awsConnections />);
 expect(html).toContain('href="/control-plane/discovery"');expect(html).toContain('Set up AWS connection');expect(html).toContain('Execution controls require separate verified onboarding');
 expect((html.match(/>Coming soon</g)||[]).length).toBe(2);
});

it.each(['overview','policies'] as const)('AWS availability stays consistent in the installed %s view', section => {
 const html=renderToStaticMarkup(<SavedWorkspace section={section} awsConnections />);
 expect(html).not.toContain('Cloud discovery and import are not enabled');
 if(section==='policies') expect(html).not.toContain('Capabilities and availability');
});

// Presentation only: the saved discovery journey remains the source of inventory.
it('connections prioritizes platforms and agents without a model planning panel',()=>{
 const html=renderToStaticMarkup(<SavedWorkspace section="connections" awsConnections />);
 const headings=[...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map(m=>m[1]);
 expect(headings).toEqual(['Agent platforms','Discovered agents','Business systems']);
 expect(html).not.toContain('<h2>Model planning</h2>');expect(html).toContain('View discovered agents');expect(html).toContain('Discovery does not enable execution controls');
 expect(html).not.toContain('Capabilities and availability');
});
it('the product capability overview appears on the workspace overview only',()=>{
 expect(renderToStaticMarkup(<SavedWorkspace section="overview"/>)).toContain('Capabilities and availability');
 for(const section of ['policies','connections'] as const)expect(renderToStaticMarkup(<SavedWorkspace section={section}/>)).not.toContain('Capabilities and availability');
});
