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
 if(section==='connections'){expect(h).toContain('Not connected in this deployment');expect(h).not.toContain('href="/control-plane/discovery"');}
});
async function mounted(section:SavedWorkspaceSection,run:(page:Page,requests:string[])=>Promise<void>,failure?:'pricing'|'connectors'|'malformed'|'unknown-state'){
 const esbuild=requireModule(requireModule.resolve('esbuild',{paths:[requireModule.resolve('@temporalio/worker')]}));
 const result=await esbuild.build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {SavedWorkspace} from './components/control-plane/saved-workspace';createRoot(document.getElementById('app')).render(<SavedWorkspace section="${section}"/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'browser',format:'iife',outfile:'memory/workspace.js',write:false,jsx:'automatic',alias:{'@':resolve('.')},define:{'process.env':'{}','process.env.NODE_ENV':'"test"'}});
 const browser=await chromium.launch({headless:true});const requests:string[]=[];
 try{const page=await browser.newPage();await page.route('https://workspace-owned.test/**',route=>{
  const p=new URL(route.request().url()).pathname;
  if(p==='/')return route.fulfill({contentType:'text/html',body:'<div id="app"></div>'});
  requests.push(route.request().method()+' '+p);
  const denied=(failure==='pricing'&&p==='/api/durable')||(failure==='connectors'&&p==='/api/durable/connectors');
  return route.fulfill({status:denied?403:200,contentType:'application/json',body:JSON.stringify(denied?{error:'Current access refused.'}:failure==='malformed'?{actions:'unknown'}:failure==='unknown-state'?{...pricing,actions:[{...pricing.actions[0],state:'new-unknown-state'}]}:p==='/api/durable'?pricing:connectors)});
 });await page.goto('https://workspace-owned.test/');await page.addScriptTag({content:result.outputFiles.find((x:{path:string})=>x.path.endsWith('.js'))?.text||result.outputFiles[0].text});await run(page,requests);}finally{await browser.close();}
}
it('mounted overview uses only installed read APIs and preserves exact-action deep links',async()=>mounted('overview',async(page,requests)=>{
 await page.getByRole('heading',{name:'25% pricing request'}).waitFor();await page.getByRole('heading',{name:'Customer record update'}).waitFor();
 expect(await page.getByRole('link',{name:'Review exact request'}).getAttribute('href')).toContain('#action-'+pricing.actions[0].id);
 expect(await page.getByRole('link',{name:'Inspect outcome'}).getAttribute('href')).toContain('workflow=crm#action-source-uncertain');
 await page.getByRole('button',{name:'Refresh saved status'}).click();await page.getByRole('heading',{name:'25% pricing request'}).waitFor();
 expect(await page.getByText('Showing up to the latest 100 pricing actions and 100 customer actions. Older pending work may be outside this view.').count()).toBe(2);
 expect(requests).toEqual(['GET /api/durable','GET /api/durable/connectors','GET /api/durable','GET /api/durable/connectors']);
}),15000);
it.each(['pricing','connectors'] as const)('mounted %s failure preserves a partial queue rather than claiming no work',async failure=>mounted('overview',async page=>{
 await page.getByRole('alert').waitFor();expect(await page.getByText('Available rows are a partial view. Other requests may still need attention.').count()).toBe(1);
 expect(await page.getByText('No held requests',{exact:false}).count()).toBe(0);expect(await page.getByText('No unresolved requests',{exact:false}).count()).toBe(0);
 await page.getByRole('heading',{name:failure==='pricing'?'Customer record update':'25% pricing request'}).waitFor();
},failure),15000);
it('malformed snapshots are unknown, not empty successful queues',async()=>mounted('approvals',async page=>{
 await page.getByRole('alert').first().waitFor();expect(await page.getByText('The recent action view could not be confirmed.',{exact:false}).count()).toBe(1);expect(await page.getByRole('link',{name:'Review exact request'}).count()).toBe(0);
},'malformed'),15000);
it('connection view does not equate policy availability with live provider health',async()=>mounted('connections',async(page,requests)=>{
 await page.getByText('Sample policy active; this is not a provider health or live-delivery check.').waitFor();
 expect(await page.getByText('No active sample policy is confirmed.').count()).toBe(1);expect(await page.getByText('Not connected in this deployment').count()).toBe(3);
 expect(requests.every(r=>r.startsWith('GET '))).toBe(true);
}),15000);

it("unknown action states do not become a successful empty queue",async()=>mounted("overview",async page=>{await page.getByRole("alert").first().waitFor();expect(await page.getByText("No held requests",{exact:false}).count()).toBe(0);expect(await page.getByRole("link",{name:"Review exact request"}).count()).toBe(0);},"unknown-state"),15000);
