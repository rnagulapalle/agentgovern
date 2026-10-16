import { expect, it } from "vitest";
import { chromium, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const requireModule = createRequire(import.meta.url);
const fixtureStyles=(async()=>{
 const postcss=requireModule('postcss'),tailwind=requireModule('tailwindcss');
 const global=await postcss([tailwind({config:resolve('tailwind.config.ts'),content:[{raw:'<span class="sr-only"></span>',extension:'html'}]})]).process(await readFile('app/globals.css','utf8'),{from:resolve('app/globals.css')});
 const font=(await readFile('node_modules/geist/dist/fonts/geist-sans/Geist-Regular.woff2')).toString('base64');
 return global.css+`@font-face{font-family:Geist;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:400;font-display:block}:root{--font-geist-sans:Geist;--font-geist-mono:monospace}`+await readFile('app/control-plane/control-plane.css','utf8')+await readFile('components/control-plane/discovery-workspace.css','utf8')+await readFile('components/control-plane/control-center.css','utf8');
})();
const arn="arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/partner_quote-abcdefghij";
const at=new Date().toISOString();
function history() {
 const base={runId:"run-one",actionId:null,occurredAt:at,attempt:1,traceId:"a".repeat(32),spanId:"b".repeat(16),triggerChannel:"slack",reportedDeploymentVersion:"2",actionName:null,provider:null,decision:null,reasonCode:null,reportedOutcome:null,ruleId:null,ruleVersion:null,requestedPercent:null,approvalThreshold:null,maximumDiscount:null,quoteId:"Q-test",evidence:"source-reported",effectVerified:false,approvalIdentityVerified:false};
 return {enrollment:{displayName:"Partner quoting",owner:"owner@example.test",logGroup:"/company/events",enrolledAt:at},checkedAt:at,source:{runtimeArn:arn,enrolledRuntimeVersion:"2",logGroup:"/company/events",startTime:Date.now()-86400000,endTime:Date.now()},events:[{...base,eventId:"start",eventName:"workflow.started",occurredAt:new Date(Date.parse(at)-2000).toISOString()},{...base,eventId:"policy",eventName:"policy.evaluated",occurredAt:new Date(Date.parse(at)-1000).toISOString(),requestedPercent:25,decision:"needs_approval",approvalThreshold:20,maximumDiscount:75},{...base,eventId:"pause",eventName:"workflow.paused",reportedOutcome:"awaiting_approval"}],completeness:"partial",unsupportedRecords:2,duplicateDeliveries:3,conflictingEventIds:[],failures:[],enforcement:"not-established"};
}
type Call={path:string;body:Record<string,unknown>|null;method:string};
async function mounted(pageName:"overview"|"agents"|"activity",run:(page:Page,calls:Call[])=>Promise<void>,failure?:"history"|"directory"|"inventory"|"malformed"){
 const esbuild=requireModule(requireModule.resolve("esbuild",{paths:[requireModule.resolve("@temporalio/worker")]}));
 const bundle=await esbuild.build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{ControlCenter}from'./components/control-plane/control-center';createRoot(document.getElementById('app')).render(<ControlCenter page="${pageName}" awsEnabled/>);`,resolveDir:process.cwd(),loader:"tsx"},bundle:true,platform:"browser",format:"iife",write:false,loader:{".css":"empty"},jsx:"automatic",alias:{"@":resolve(".")},define:{"process.env":"{}","process.env.NODE_ENV":'"test"'}});
 const browser=await chromium.launch({headless:true}),calls:Call[]=[];
 try{const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'});page.setDefaultTimeout(4000);
 await page.route("https://control-center.test/**",async route=>{
  const url=new URL(route.request().url()),path=url.pathname,body=route.request().postDataJSON(),method=route.request().method();if(path==="/")return route.fulfill({contentType:"text/html",body:`<div class="cp-app"><div class="cp-content" style="width:100%" id="app"></div></div><script>${bundle.outputFiles[0].text}</script>`});calls.push({path,body,method});let value:unknown,status=200;
  if(path==="/api/workspace/agents"){value={agents:[],owners:[]};if(failure==="directory"){status=503;value={error:"Directory unavailable"}}}
  else if(path==="/api/workspace/discovery"&&!url.search){value={connections:[{scope:{connectionId:"aws-test",accountId:"123456789012",region:"us-west-2"}}]};}
  else if(path==="/api/workspace/discovery"){value={status:"observed",scanId:"00000000-0000-4000-8000-000000000001",stale:true,records:[{record:{resourceArn:arn,resourceId:"partner_quote-abcdefghij",version:"1"},stale:true,observedInCurrentScan:false},{record:{resourceArn:arn,resourceId:"partner_quote-abcdefghij",version:"2"},stale:true,observedInCurrentScan:true}]};if(failure==="inventory"){status=403;value={error:"Access refused"}}}
  else if(path==="/api/workspace/discovery/onboarding"){if(body?.operation==="enrollment")value={enrollment:history().enrollment};else if(body?.operation==="history"){value=history();if(failure==="history"){status=503;value={error:"History identity unavailable"}}if(failure==="malformed")value={events:null};}else{status=400;value={error:"Unexpected mutation"}}}
  else if(path==="/api/workspace/discovery/approvals")value={connected:true,requests:[],reviewer:"manager@example.test",canReview:true};
  else {status=404;value={error:"Unexpected endpoint"}}
  await route.fulfill({status,contentType:"application/json",body:JSON.stringify(value)});
 });
 await page.goto("https://control-center.test/");await page.addStyleTag({content:await fixtureStyles});await page.getByText("On-demand read",{exact:false}).waitFor();await run(page,calls);
 }finally{await browser.close()}
}
it("groups deployment versions and keeps identity and enforcement separate",()=>mounted("agents",async(page,calls)=>{
 expect(await page.locator('.cc-agent-row').count()).toBe(1);await page.getByRole('button',{name:/Partner quoting/}).click();await page.getByRole('dialog').waitFor();await page.getByText('Purpose has not been provided',{exact:false}).waitFor();expect(await page.getByText('Not verified',{exact:true}).count()).toBe(1);expect(calls.filter(c=>c.body?.operation==='enrollment').map(c=>c.body?.version)).toEqual(['2']);expect(calls.some(c=>c.body?.operation==='history')).toBe(false);
}),15000);
it("execution review preserves filters, selection and keyboard return focus",()=>mounted("activity",async(page,calls)=>{
 await page.getByLabel('Search activity').fill('Q-test');const trigger=page.getByRole('button',{name:/25% discount/});await trigger.click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Review this execution’s approvals'}).click();await page.getByText('No shared approval request was returned for this execution.',{exact:false}).waitFor();expect(calls.find(c=>c.path.endsWith('/approvals'))?.body).toMatchObject({connectionId:'aws-test',resourceArn:arn,version:'2',operation:'list'});await page.getByRole('button',{name:'Back to execution',exact:true}).click();await page.getByRole('button',{name:'Close dialog',exact:true}).click();expect(await page.getByLabel('Search activity').inputValue()).toBe('Q-test');expect(await trigger.evaluate(e=>e===document.activeElement)).toBe(true);expect(calls.every(c=>c.method==='GET'||['enrollment','history','list'].includes(String(c.body?.operation)))).toBe(true);
}),15000);
it.each(['history','inventory','malformed'] as const)("%s failure stays unknown instead of a successful empty history",failure=>mounted('activity',async page=>{await page.getByRole('alert').first().waitFor();expect(await page.locator('.cc-execution-row').count()).toBe(0);await page.getByText('Activity could not be fully checked.',{exact:false}).waitFor();},failure),15000);
it("one failed directory does not erase the separately observed AWS execution",()=>mounted('overview',async page=>{await page.getByRole('alert').waitFor();expect(await page.locator('.cc-execution-row').count()).toBe(2);},'directory'),15000);
it("nested connection review closes one panel at a time and restores page scroll",()=>mounted('overview',async page=>{
 await page.getByRole('button',{name:'Review connections',exact:true}).click();
 await page.getByRole('button',{name:'Set up AWS connection',exact:true}).click();
 expect(await page.getByRole('dialog').count()).toBe(2);
 await page.keyboard.press('Escape');expect(await page.getByRole('dialog').count()).toBe(1);
 expect(await page.evaluate(()=>document.body.style.overflow)).toBe('hidden');
 await page.keyboard.press('Escape');expect(await page.getByRole('dialog').count()).toBe(0);
 expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
}),15000);
it("source gaps remain visible, amount is unknown and drawer fits narrow screens",()=>mounted('activity',async page=>{
 await page.getByText('History coverage and source gaps').click();await page.getByText('2 unsupported records',{exact:false}).waitFor();await page.getByRole('button',{name:/25% discount/}).click();await page.getByText('Not shared by workflow',{exact:true}).waitFor();await page.setViewportSize({width:390,height:900});expect(await page.evaluate(()=>Array.from(document.querySelectorAll('body *')).filter(e=>e.getBoundingClientRect().right>innerWidth+1&&e.getBoundingClientRect().width>0).map(e=>[e.tagName,e.className,Math.round(e.getBoundingClientRect().right)]).slice(0,12))).toEqual([]);await page.screenshot({path:'.local/control-plane-ux-release/activity-mobile.png',fullPage:true,animations:'disabled'});await page.setViewportSize({width:1440,height:1100});await page.screenshot({path:'.local/control-plane-ux-release/activity-desktop.png',fullPage:true,animations:'disabled'});
}),15000);
