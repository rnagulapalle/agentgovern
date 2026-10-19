import { expect, it } from "vitest";
import { chromium, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir,readFile,writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const requireModule = createRequire(import.meta.url);
const fixtureStyles=(async()=>{
 const postcss=requireModule('postcss'),tailwind=requireModule('tailwindcss');
 const global=await postcss([tailwind({config:resolve('tailwind.config.ts'),content:[{raw:'<span class="sr-only"></span>',extension:'html'}]})]).process(await readFile('app/globals.css','utf8'),{from:resolve('app/globals.css')});
 const font=(await readFile('node_modules/geist/dist/fonts/geist-sans/Geist-Regular.woff2')).toString('base64');
 return global.css+`@font-face{font-family:Geist;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:400;font-display:block}:root{--font-geist-sans:Geist;--font-geist-mono:monospace}`+await readFile('app/control-plane/control-plane.css','utf8')+await readFile('components/control-plane/discovery-workspace.css','utf8')+await readFile('components/control-plane/control-center.css','utf8')+await readFile('components/control-plane/saved-workspace.css','utf8');
})();
const arn="arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/partner_quote-abcdefghij";
const at=new Date().toISOString();
function history() {
 const base={runId:"run-one",approvalId:null as string|null,actionId:null,occurredAt:at,attempt:1,traceId:"a".repeat(32),spanId:"b".repeat(16),triggerChannel:"slack",reportedDeploymentVersion:"2",actionName:null,provider:null,decision:null,reasonCode:null,reportedOutcome:null,ruleId:null,ruleVersion:null,requestedPercent:null,approvalThreshold:null,maximumDiscount:null,quoteId:"Q-test",evidence:"source-reported",effectVerified:false,approvalIdentityVerified:false};
 return {enrollment:{displayName:"Partner quoting",owner:"owner@example.test",logGroup:"/company/events",enrolledAt:at},checkedAt:at,source:{runtimeArn:arn,enrolledRuntimeVersion:"2",logGroup:"/company/events",startTime:Date.now()-86400000,endTime:Date.now()},events:[{...base,eventId:"start",eventName:"workflow.started",occurredAt:new Date(Date.parse(at)-2000).toISOString()},{...base,eventId:"policy",eventName:"policy.evaluated",occurredAt:new Date(Date.parse(at)-1000).toISOString(),requestedPercent:25,decision:"needs_approval",approvalThreshold:20,maximumDiscount:75},{...base,eventId:"pause",eventName:"workflow.paused",reportedOutcome:"awaiting_approval"}],completeness:"partial",unsupportedRecords:2,duplicateDeliveries:3,conflictingEventIds:[],failures:[],enforcement:"not-established"};
}
type Call={path:string;body:Record<string,unknown>|null;method:string};
async function mounted(pageName:"overview"|"agents"|"activity"|"approvals"|"policies"|"connections"|"organization",run:(page:Page,calls:Call[],releaseLoading:()=>void)=>Promise<void>,failure?:"history"|"directory"|"inventory"|"malformed"|"approvals"|"impact"|"impact-other"|"impact-ambiguous"|"impact-id-mismatch"|"pending"|"expired-pending"|"company-save"|"discovered"|"discovered-stale",companyCase=false,showShell=false,fleetCase=false,queryString=""){
 const esbuild=requireModule(requireModule.resolve("esbuild",{paths:[requireModule.resolve("@temporalio/worker")]}));
 const content=pageName==='organization'?'<CompanyOrganization/>':pageName==='connections'?'<SavedWorkspace section="connections" awsConnections/>':`<ControlCenter page="${pageName}" awsEnabled/>`;
 const member={name:'Raj Nagulapalle',email:'raj@example.test',company:'ACME'};
 const wrapped=showShell?`<ControlProvider><ControlShell scriptDemo member={${JSON.stringify(member)}}>${content}</ControlShell></ControlProvider>`:content;
 const bundle=await esbuild.build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{ControlCenter}from'./components/control-plane/control-center';import{ControlShell}from'./components/control-plane/shell';import{ControlProvider}from'./components/control-plane/provider';import{SavedWorkspace}from'./components/control-plane/saved-workspace';import{CompanyWorkspaceProvider,CompanyOrganization}from'./components/control-plane/company-workspace';createRoot(document.getElementById('app')).render(<CompanyWorkspaceProvider enabled={${companyCase}}>${wrapped}</CompanyWorkspaceProvider>);`,resolveDir:process.cwd(),loader:"tsx"},bundle:true,platform:"browser",format:"iife",write:false,loader:{".css":"empty"},jsx:"automatic",alias:{"@":resolve(".")},plugins:[{name:'fixture-location',setup(build: {onResolve:(a:unknown,b:()=>unknown)=>void;onLoad:(a:unknown,b:()=>unknown)=>void}){build.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const usePathname=()=>${JSON.stringify('/control-plane/'+(pageName==='overview'?'':pageName==='connections'?'connectors':pageName))};`}))}}],define:{"process.env":"{}","process.env.NODE_ENV":'"test"'}});
 let companyProfile={name:'ACME',revision:1,departments:[{id:'sales',name:'Sales',businessUnit:''},{id:'support',name:'Support',businessUnit:''}],teams:[{id:'revenue',name:'Revenue operations',departmentId:'sales'},{id:'care',name:'Customer operations',departmentId:'support'}],assignments:[{agentKey:JSON.stringify(['aws-test',arn]),teamId:'revenue',purpose:'Prepare customer quotes',environment:'production'},{agentKey:JSON.stringify(['aws-test',arn+'-support']),teamId:'care',purpose:'Triage support requests',environment:'sandbox'}]};
 let releaseLoading=()=>{};const loadingGate=new Promise<void>(resolve=>{releaseLoading=resolve;});const inspectLoading=new URLSearchParams(queryString).get("inspectLoading");
 const browser=await chromium.launch({headless:true}),calls:Call[]=[];
 try{const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'});page.setDefaultTimeout(4000);
 await page.route("https://control-center.test/**",async route=>{
  const url=new URL(route.request().url()),path=url.pathname,body=route.request().postDataJSON(),method=route.request().method();if(path==="/")return route.fulfill({contentType:"text/html",body:`${showShell?'<div id="app"></div>':'<div class="cp-app cc-brand-system"><div class="cp-content" style="width:100%" id="app"></div></div>'}<script>${bundle.outputFiles[0].text}</script>`});calls.push({path,body,method});if(queryString.includes("delayEnrollment=1")&&path==="/api/workspace/discovery/onboarding"&&body?.operation==="enrollment"&&body?.version==="1")await new Promise(resolve=>setTimeout(resolve,150));if(inspectLoading&&((inspectLoading==="accounts"&&path==="/api/workspace/discovery"&&!url.search)||(inspectLoading==="company"&&path==="/api/workspace/company")))await loadingGate;let value:unknown,status=200;
  if(path==="/api/workspace/discovery/owners")value={owners:[{name:"Raj",email:"raj@example.test"}]};
  else if(path==="/api/workspace/company"){if(method==='POST')companyProfile={...body,revision:companyProfile.revision+1} as typeof companyProfile;value={installed:true,profile:companyProfile,members:[{name:'Raj',email:'raj@example.test'},{name:'Pratibha',email:'pratibha@example.test'}]};}
  else if(path==="/api/durable")value={actions:[],agents:[],policy:{auto_limit:15,hard_limit:50,version:2}};
  else if(path==="/api/durable/connectors")value={actions:[],policies:[{connector:"crm",active:true,version:1},{connector:"email",active:true,version:1}]};
  else if(path==="/api/workspace/agents"){value={agents:[],owners:[]};if(failure==="directory"){status=503;value={error:"Directory unavailable"}}}
  else if(path==="/api/workspace/discovery"&&!url.search){value={connections:[{scope:{connectionId:"aws-test",accountId:"123456789012",region:"us-west-2"}}]};}
  else if(path==="/api/workspace/discovery"){value={status:"observed",scanId:"00000000-0000-4000-8000-000000000001",stale:true,records:[{record:{resourceArn:arn,resourceId:"partner_quote-abcdefghij",version:"1"},stale:true,observedInCurrentScan:false},{record:{resourceArn:arn,resourceId:"partner_quote-abcdefghij",version:"2",declaredMetadata:{schemaVersion:"1",source:"aws-runtime-declaration",metadataVersion:"3",organization:"Acme",ownerOrganization:"Acme Revenue Operations",ownerTeam:"Sales Support and Quote Operations",environment:"production",onCallStatus:"unassigned"}},stale:true,observedInCurrentScan:true}]};if(failure==="inventory"){status=403;value={error:"Access refused"}}}
  else if(path==="/api/workspace/discovery/onboarding"){if(body?.operation==="enrollment")value={enrollment:history().enrollment};else if(body?.operation==="history"){value=history();if(failure==="impact-id-mismatch"){const h=value as ReturnType<typeof history>;h.events.push({...h.events[0],eventId:"reported-approval",eventName:"approval.approved",approvalId:"expected-approval"});}if(failure==="history"){status=503;value={error:"History identity unavailable"}}if(failure==="malformed")value={events:null};}else{status=400;value={error:"Unexpected mutation"}}}
  else if(path==="/api/workspace/discovery/approvals"){value={connected:true,requests:[],reviewer:"manager@example.test",canReview:true};if(failure==="approvals"){status=503;value={error:"Approval source unavailable"};}}
  else {status=404;value={error:"Unexpected endpoint"}}
  if((failure==='pending'||failure==='expired-pending')&&path.endsWith('/approvals'))value={connected:true,canReview:true,reviewer:'manager@example.test',requests:body?.version==='2'?[{id:'request-one',runId:'run-one',revision:'a'.repeat(64),policyVersion:'policy-2',status:'pending',title:'Review customer discount',reason:'25% exceeds delegated authority.',action:'Update quote',system:'CRM',before:'USD 1200.00',after:'USD 900.00',requestedBy:'customer@example.test',allowedReviewers:['manager@example.test'],expiresAt:new Date(Date.now()+(failure==='pending'?3600000:-3600000)).toISOString(),decidedBy:null,decidedAt:null,channel:'slack',executionStatus:'held'}]:[]};
  if(failure?.startsWith('impact')&&path.endsWith('/approvals')){const a={id:'different-approval',policyVersion:'discount-policy-3',requestedBy:'requester@example.test',decidedBy:'manager@example.test',decidedAt:'2026-10-17T12:02:12Z',runId:failure==='impact-other'?'other-run':'run-one',before:'USD 1200.00',after:'USD 900.00',status:'approved',executionStatus:'completed'};value={connected:true,requests:failure==='impact-ambiguous'?[a,a]:[a]};}
  if(failure?.startsWith('discovered')&&path.endsWith('/onboarding')&&body?.operation==='enrollment')value={enrollment:null};
  if(failure==='discovered'&&path==='/api/workspace/discovery'&&url.search){const inventory=value as {stale:boolean;records:{stale:boolean;observedInCurrentScan:boolean}[]};inventory.stale=false;inventory.records.forEach(r=>{r.stale=false;r.observedInCurrentScan=true;});}
  if(fleetCase&&path==="/api/workspace/discovery"&&url.search){const v=value as {records:unknown[]};v.records.unshift(...Array.from({length:7},(_,i)=>({record:{resourceArn:arn+'-fleet'+i,resourceId:'fleet_agent_'+i,version:'1',declaredMetadata:{schemaVersion:'2',source:'aws-runtime-declaration',metadataVersion:'1',organization:'Acme',ownerOrganization:null,ownerTeam:i%2?'care':'sales-ops',department:i%2?'Support':'Sales',owner:'Raj',purpose:'Serve customers',environment:'production',onCallStatus:'unassigned'}},stale:false,observedInCurrentScan:true})));}
  if(fleetCase&&body?.resourceArn!==arn&&path.endsWith('/onboarding'))value={enrollment:null};
  if(fleetCase&&body?.operation==='history'&&body.resourceArn===arn){const h=history();value={...h,events:h.events.map(e=>({...e,reportedDeploymentVersion:'1'}))};}
  if(companyCase&&path==="/api/workspace/discovery"&&url.search){const v=value as {records:unknown[]};v.records.push({record:{resourceArn:arn+'-support',resourceId:'support_assistant-abcdefghij',version:'2'},stale:false,observedInCurrentScan:true});}
  if(companyCase&&body?.resourceArn===arn+'-support'&&path.endsWith('/onboarding')){if(body.operation==='enrollment')value={enrollment:{...history().enrollment,displayName:'Support assistant'}};if(body.operation==='history'){const h=history();value={...h,enrollment:{...h.enrollment,displayName:'Support assistant'},events:h.events.map(e=>({...e,runId:'run-support',requestedPercent:null}))};}}
  if(failure==='company-save'&&path==='/api/workspace/company'&&method==='POST'){status=409;value={error:'Directory changed. Refresh before saving again.'};}
  await route.fulfill({status,contentType:"application/json",body:JSON.stringify(value)});
 });
 await page.goto("https://control-center.test/"+queryString);await page.addStyleTag({content:await fixtureStyles});if(inspectLoading)await page.getByText("Loading your workspace…",{exact:true}).waitFor();else if(["connections","organization"].includes(pageName))await page.getByText("ACME",{exact:true}).first().waitFor();else await page.getByText("On-demand read",{exact:false}).waitFor();await run(page,calls,releaseLoading);
 }finally{await browser.close()}
}
it("groups deployment versions and keeps identity and enforcement separate",()=>mounted("agents",async(page,calls)=>{
 expect(await page.locator('.cc-agent-row').count()).toBe(1);await page.getByRole('button',{name:/Partner quoting/}).click();await page.getByRole('dialog').waitFor();await page.getByText('Purpose has not been provided',{exact:false}).waitFor();expect(await page.getByText('Not verified',{exact:true}).count()).toBe(1);await page.getByText('AWS-reported details & technical identity',{exact:true}).click();await page.getByRole('heading',{name:'AWS-reported business details'}).waitFor();const metadata=page.locator('section').filter({has:page.getByRole('heading',{name:'AWS-reported business details'})});expect(await metadata.innerText()).toContain('Acme Revenue Operations');expect(await metadata.innerText()).toContain('Sales Support and Quote Operations');expect(await metadata.innerText()).toContain('unassigned');expect(await metadata.innerText()).toContain('do not assign company teams');await page.screenshot({path:'.local/v16-metadata/agent-details-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:900});await page.getByText('Metadata version',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'.local/v16-metadata/agent-details-mobile.png',fullPage:false});expect(await page.locator('[role=dialog]').evaluate(e=>e.getBoundingClientRect().right<=innerWidth+1)).toBe(true);expect(calls.filter(c=>c.body?.operation==='enrollment').map(c=>c.body?.version)).toEqual(['2']);expect(calls.some(c=>c.body?.operation==='history')).toBe(true);
}),15000);
it("execution review preserves filters, selection and keyboard return focus",()=>mounted("activity",async(page,calls)=>{
 await page.getByLabel('Search activity').fill('Q-test');const trigger=page.getByRole('button',{name:/25% discount/});await trigger.click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Review this execution’s approvals'}).click();await page.getByText('No shared approval request was returned for this execution.',{exact:false}).waitFor();expect(calls.find(c=>c.path.endsWith('/approvals'))?.body).toMatchObject({connectionId:'aws-test',resourceArn:arn,version:'2',operation:'list'});await page.getByRole('button',{name:'Back to execution',exact:true}).click();await page.getByRole('button',{name:'Close dialog',exact:true}).click();expect(await page.getByLabel('Search activity').inputValue()).toBe('Q-test');expect(await trigger.evaluate(e=>e===document.activeElement)).toBe(true);expect(calls.every(c=>c.method==='GET'||['enrollment','history','list'].includes(String(c.body?.operation)))).toBe(true);
}),15000);
it.each(['history','inventory','malformed'] as const)("%s failure stays unknown instead of a successful empty history",failure=>mounted('activity',async page=>{await page.getByRole('alert').first().waitFor();expect(await page.locator('.cc-execution-row').count()).toBe(0);await page.getByText('Activity could not be fully checked.',{exact:false}).waitFor();},failure),15000);
it("one failed directory does not erase the separately observed AWS execution",()=>mounted('overview',async page=>{await page.getByRole('alert').waitFor();expect(await page.locator('.cc-execution-row').count()).toBe(1);},'directory'),15000);
it("Overview omits the redundant bottom section while keeping actionable connection coverage",()=>mounted('overview',async page=>{
 expect(await page.getByRole('link',{name:'Review connections',exact:false}).getAttribute('href')).toBe('/control-plane/connectors?coverage=history');
 expect(await page.getByRole('region',{name:'Control availability',exact:true}).count()).toBe(0);
 expect(await page.getByText('Sample decisions and outcomes',{exact:true}).count()).toBe(0);
 expect(await page.getByRole('button',{name:'View coverage',exact:true}).count()).toBe(0);
 expect(await page.getByText('Visibility, shared approval decisions and execution enforcement are separate capabilities.',{exact:false}).count()).toBe(0);
 expect(await page.getByRole('heading',{name:'Latest business activity',exact:true}).isVisible()).toBe(true);
 expect(await page.getByRole('heading',{name:'Operations across your company',exact:true}).isVisible()).toBe(true);
}),15000);
it("source gaps remain visible, amount is unknown and drawer fits narrow screens",()=>mounted('activity',async page=>{
 await page.getByText('History coverage and source gaps').click();await page.getByText('2 unsupported records',{exact:false}).waitFor();await page.getByRole('button',{name:/25% discount/}).click();await page.getByText('Not shared by workflow',{exact:true}).waitFor();await page.setViewportSize({width:390,height:900});expect(await page.evaluate(()=>Array.from(document.querySelectorAll('body *')).filter(e=>e.getBoundingClientRect().right>innerWidth+1&&e.getBoundingClientRect().width>0).map(e=>[e.tagName,e.className,Math.round(e.getBoundingClientRect().right)]).slice(0,12))).toEqual([]);await page.screenshot({path:'.local/control-plane-ux-release/activity-mobile.png',fullPage:true,animations:'disabled'});await page.setViewportSize({width:1440,height:1100});await page.screenshot({path:'.local/control-plane-ux-release/activity-desktop.png',fullPage:true,animations:'disabled'});
}),15000);

it("ACME business filters separate two departments and persist an agent purpose through the company API",()=>mounted('agents',async(page,calls)=>{
 await page.getByText('ACME',{exact:true}).waitFor();expect(await page.locator('.cc-agent-row').count()).toBe(2);
 await page.getByLabel('Department',{exact:true}).selectOption('sales');expect(await page.locator('.cc-agent-row').count()).toBe(1);
 await page.getByRole('button',{name:/Partner quoting/}).click();await page.getByRole('button',{name:'Business details',exact:true}).click();await page.getByLabel('Purpose',{exact:true}).fill('Prepare scoped renewal quotes');await page.getByRole('button',{name:'Save business details',exact:true}).click();await page.getByText('Business details saved.',{exact:false}).waitFor();
 expect(calls.filter(c=>c.path==='/api/workspace/company'&&c.method==='POST')).toHaveLength(1);const saved=calls.find(c=>c.path==='/api/workspace/company'&&c.method==='POST')!.body;expect(saved).toMatchObject({name:'ACME',revision:1,assignments:expect.arrayContaining([expect.objectContaining({purpose:'Prepare scoped renewal quotes',teamId:'revenue'})])});
 await page.getByRole('button',{name:'Close dialog',exact:true}).click();await page.getByLabel('Department',{exact:true}).selectOption('support');expect(await page.locator('.cc-agent-row').count()).toBe(1);await page.getByRole('button',{name:/Support assistant/}).waitFor();
},undefined,true),20000);
it("company Overview never turns reported held history into a current actionable approval count",()=>mounted('overview',async page=>{await page.getByText('ACME',{exact:true}).waitFor();const stats=page.locator('.cc-admin-stats');expect(await stats.innerText()).toContain('Waiting for approval');expect(await stats.locator('strong').nth(1).innerText()).toBe('0');expect(await page.locator('.cc-execution-row').count()).toBe(2);await page.getByText('No current pending shared approvals returned in this scope.').waitFor();},undefined,true),20000);
it("company activity scope keeps each execution identity and fits on a phone",()=>mounted('activity',async page=>{await page.getByText('ACME',{exact:true}).waitFor();expect(await page.locator('.cc-execution-row').count()).toBe(2);await page.getByLabel('Department',{exact:true}).selectOption('support');expect(await page.locator('.cc-execution-row').count()).toBe(1);await page.setViewportSize({width:390,height:900});expect(await page.evaluate(()=>Array.from(document.querySelectorAll('body *')).filter(e=>e.getBoundingClientRect().right>innerWidth+1&&e.getBoundingClientRect().width>0).map(e=>[e.tagName,e.className,Math.round(e.getBoundingClientRect().right)]).slice(0,12))).toEqual([]);},undefined,true),20000);

it.each(['overview','agents','activity','approvals','connections','policies','organization'] as const)('captures the implemented %s page with the shared ACME administrator shell',pageName=>mounted(pageName,async page=>{
 if(pageName==='connections'){await page.getByText('Sample pricing rules loaded.',{exact:false}).waitFor();expect(await page.getByRole('alert').count()).toBe(0);}
 const readingScale=async()=>({title:await page.locator('.cp-page-title h1').first().evaluate(e=>getComputedStyle(e).fontSize),nav:await page.locator('.cp-nav-item.is-active').evaluate(e=>getComputedStyle(e).fontSize),action:await page.locator('.cp-button').first().evaluate(e=>getComputedStyle(e).fontSize)});
 expect(await readingScale()).toEqual({title:'36px',nav:'17px',action:'18px'});
 if(pageName==='activity'){
  expect(await page.locator('.cc-execution-row strong').first().evaluate(e=>getComputedStyle(e).fontSize)).toBe('18px');
  expect(await page.locator('.cc-execution-row small').first().evaluate(e=>getComputedStyle(e).fontSize)).toBe('16px');
  expect(await page.locator('.cc-execution-row .cc-outcome').first().evaluate(e=>getComputedStyle(e).fontSize)).toBe('16px');
 }
 await mkdir('.local/acme-admin/screenshots',{recursive:true});expect(await page.locator('.cp-nav-item.is-active').evaluate(e=>getComputedStyle(e).color)).toBe('rgb(255, 255, 255)');await page.getByText('ACME',{exact:true}).first().waitFor();await page.screenshot({path:'.local/acme-admin/screenshots/'+pageName+'.png',fullPage:true,animations:'disabled'});
 if(pageName==='agents'){await page.getByRole('button',{name:/Partner quoting/}).click();await page.getByRole('dialog').waitFor();await page.screenshot({path:'.local/acme-admin/screenshots/agent-details.png',fullPage:true,animations:'disabled'});await page.getByRole('button',{name:'Business details',exact:true}).click();await page.screenshot({path:'.local/acme-admin/screenshots/agent-business-details.png',fullPage:true,animations:'disabled'});await page.getByRole('button',{name:'Close dialog',exact:true}).click();}
 if(pageName==='activity'){await page.getByRole('button',{name:/25% discount/}).first().click();await page.getByRole('dialog').waitFor();expect(await page.locator('.cp-modal-heading h2').evaluate(e=>getComputedStyle(e).fontSize)).toBe('24px');expect(await page.locator('.aws-timeline-title strong').first().evaluate(e=>getComputedStyle(e).fontSize)).toBe('18px');expect(await page.locator('.aws-timeline-title time').first().evaluate(e=>getComputedStyle(e).fontSize)).toBe('16px');await page.screenshot({path:'.local/acme-admin/screenshots/activity-timeline.png',fullPage:true,animations:'disabled'});await page.getByRole('button',{name:'Close dialog',exact:true}).click();}

 if(pageName==='organization'){await page.getByLabel('Company name',{exact:true}).fill('ACME Corporation');await page.getByRole('button',{name:'Save company directory',exact:true}).click();await page.getByText('Company directory saved.',{exact:false}).waitFor();expect(await page.getByText('Company administrator',{exact:true}).count()).toBe(3);}
 await page.setViewportSize({width:390,height:900});expect(await page.evaluate(()=>Array.from(document.querySelectorAll('body *')).filter(e=>e.getBoundingClientRect().right>innerWidth+1&&e.getBoundingClientRect().width>0).map(e=>[e.tagName,e.className,Math.round(e.getBoundingClientRect().right)]).slice(0,12))).toEqual([]);
 expect(await readingScale()).toEqual({title:'32px',nav:'17px',action:'18px'});
 await page.screenshot({path:'.local/acme-admin/screenshots/'+pageName+'-mobile.png',fullPage:true,animations:'disabled'});
},undefined,true,true),25000);

it('failed approval reads stay unknown while separately observed activity remains visible',()=>mounted('overview',async page=>{expect(await page.locator('.cc-admin-stats strong').nth(1).innerText()).toBe('—');expect(await page.locator('.cc-execution-row').count()).toBe(2);await page.getByRole('heading',{name:'Approval coverage is incomplete',exact:true}).waitFor();},'approvals',true),15000);

it('shows all eight saved deployments and never calls incomplete approval coverage zero',()=>mounted('overview',async(page,calls)=>{
 expect(await page.locator('.cc-admin-stats strong').first().innerText()).toBe('8');
 expect(await page.locator('.cc-admin-stats strong').nth(1).innerText()).toBe('—');
 expect(calls.filter(c=>c.body?.operation==='enrollment').some(c=>String(c.body?.resourceArn).endsWith('-fleet6'))).toBe(true);
 expect(await page.locator('.cc-execution-row').count()).toBe(1);
 expect(await page.getByText('Showing up to 3 deployments',{exact:false}).count()).toBe(0);
},undefined,false,false,true),20000);
it('source departments filter all eight rows without granting company membership',()=>mounted('agents',async(page)=>{
 expect(await page.locator('.cc-agent-row').count()).toBe(8);
 await page.getByLabel('Department',{exact:true}).selectOption('aws-department:Sales');
 expect(await page.locator('.cc-agent-row').count()).toBe(4);
 await page.getByLabel('Environment',{exact:true}).selectOption('production');
 expect(await page.locator('.cc-agent-row').count()).toBe(4);
 await page.getByRole('button',{name:/fleet agent 0/}).click();await page.getByText('AWS-reported agent details',{exact:true}).click();await page.getByText('Raj',{exact:true}).waitFor();
},undefined,false,false,true),20000);
it('uses the retained reported v1 approval connection for a run read under inventory v2',()=>mounted('activity',async(page,calls)=>{
 await page.getByRole('button',{name:/25% discount/}).click();await page.getByRole('button',{name:'Review this execution’s approvals'}).click();
 await page.getByText('No shared approval request was returned for this execution.',{exact:false}).waitFor();
 expect(calls.filter(c=>c.path.endsWith('/approvals')).every(c=>c.body?.version==='1')).toBe(true);
},undefined,false,false,true),20000);

it('shows before and proposed values only for the uniquely matched execution approval',()=>mounted('activity',async(page,calls)=>{
 await page.getByRole('button',{name:/25% discount/}).click();await page.getByText('USD 1200.00',{exact:true}).waitFor();await page.getByText('USD 900.00',{exact:true}).waitFor();
 expect(await page.locator('.aws-business-impact').getByText('manager@example.test',{exact:true}).isVisible()).toBe(true);
 expect(await page.locator('.aws-business-impact').getByText('discount-policy-3',{exact:true}).isVisible()).toBe(true);
 expect(calls.find(c=>c.path.endsWith('/approvals'))?.body).toMatchObject({operation:'list',version:'2',resourceArn:arn});
 expect(calls.some(c=>c.body?.operation==='decide')).toBe(false);
},'impact'),15000);
it.each(['impact-other','impact-ambiguous'] as const)('does not enrich with mismatched or ambiguous approval data: %s',failure=>mounted('activity',async page=>{
 await page.getByRole('button',{name:/25% discount/}).click();await page.getByText('No unique approval readback matched this execution.',{exact:true}).waitFor();expect(await page.getByText('USD 1200.00',{exact:true}).count()).toBe(0);
},failure),15000);

it('Overview shows real approval context and opens the same deployment request without deciding',()=>mounted('overview',async(page,calls)=>{
 const card=page.locator('.cc-business-request');expect(await card.count()).toBe(1);expect(await page.locator('.cc-overview-followup-row').count()).toBe(0);await card.getByText('USD 1200.00',{exact:true}).waitFor();await card.getByText('USD 900.00',{exact:true}).waitFor();expect(await card.innerText()).toContain('25% exceeds delegated authority.');
 const headings=await page.locator('.cc-section-heading h2').allTextContents();expect(headings.indexOf('Latest business activity')).toBeLessThan(headings.indexOf('Operations across your company'));
 await page.setViewportSize({width:390,height:900});expect(await page.locator('.cc-admin-stats').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length)).toBe(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await mkdir('.local/cio-overview-release/screenshots',{recursive:true});await page.screenshot({path:'.local/cio-overview-release/screenshots/mobile-overview.png',fullPage:true});
 await card.getByRole('button',{name:'Review request',exact:true}).click();await page.getByRole('dialog').waitFor();await page.getByText('Connection & decision rules',{exact:true}).click();await page.locator('.aws-review-connection dd').getByText('2',{exact:true}).waitFor();await page.getByRole('dialog').getByText('Review customer discount',{exact:true}).waitFor();expect(calls.some(c=>c.body?.operation==='decide')).toBe(false);
},'pending',false,true),20000);
it('expired approval is never promoted to a decision card',()=>mounted('overview',async page=>{expect(await page.locator('.cc-business-request').count()).toBe(0);await page.getByText('No current pending shared approvals returned in this scope.',{exact:true}).waitFor();},'expired-pending'),15000);
it('inventory-only Overview shows gaps without fabricated workflows or sample amounts',()=>mounted('overview',async page=>{
 await page.getByText('7 deployments have no current history read',{exact:true}).waitFor();expect(await page.locator('.cc-department-agent').count()).toBe(8);expect(await page.getByText('USD 1200.00',{exact:true}).count()).toBe(0);expect(await page.getByText('Quote handling',{exact:true}).count()).toBe(0);
 await page.getByLabel('Department',{exact:true}).selectOption('aws-department:Sales');expect(await page.locator('.cc-department-agent').count()).toBe(4);await page.setViewportSize({width:390,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
},undefined,false,true,true),20000);

it('Organization keeps a draft when refresh is cancelled and discards only after confirmation',()=>mounted('organization',async(page,calls)=>{
 await page.getByLabel('Company name',{exact:true}).fill('Unsaved company');await page.getByText('Unsaved changes.',{exact:false}).waitFor();const before=calls.filter(c=>c.path==='/api/workspace/company').length;
 await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('dialog',{name:'Discard unsaved changes?',exact:true}).waitFor();expect(calls.filter(c=>c.path==='/api/workspace/company').length).toBe(before);
 await page.getByRole('button',{name:'Keep editing',exact:true}).click();expect(await page.getByLabel('Company name',{exact:true}).inputValue()).toBe('Unsaved company');
 await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('button',{name:'Discard and refresh',exact:true}).click();await page.waitForFunction(()=>document.querySelector('input')?.value==='ACME');expect(calls.filter(c=>c.path==='/api/workspace/company'&&c.method==='POST')).toHaveLength(0);
 await page.getByRole('button',{name:'Refresh',exact:true}).click();expect(await page.getByRole('dialog').count()).toBe(0);
},undefined,true,true),15000);
it('Organization protects drafts on navigation links and does not leave when dismissed',()=>mounted('organization',async(page,calls)=>{
 await page.getByLabel('Company name',{exact:true}).fill('Unsaved navigation');await page.getByRole('link',{name:'Agents',exact:true}).click();await page.getByRole('button',{name:'Discard and leave',exact:true}).waitFor();await page.keyboard.press('Escape');expect(await page.getByLabel('Company name',{exact:true}).inputValue()).toBe('Unsaved navigation');expect(calls.some(c=>c.method==='POST')).toBe(false);
 await page.setViewportSize({width:390,height:900});await page.getByRole('button',{name:'Refresh',exact:true}).click();expect(await page.getByRole('dialog').evaluate(e=>e.getBoundingClientRect().right<=innerWidth)).toBe(true);await page.getByRole('button',{name:'Keep editing',exact:true}).click();
},undefined,true,true),15000);
it('successful Organization save clears the unsaved warning and refresh needs no discard prompt',()=>mounted('organization',async page=>{
 await page.getByLabel('Company name',{exact:true}).fill('Saved company');await page.getByRole('button',{name:'Save company directory',exact:true}).click();await page.getByText('Company directory saved.',{exact:false}).waitFor();expect(await page.getByText('Unsaved changes.',{exact:false}).count()).toBe(0);await page.getByRole('button',{name:'Refresh',exact:true}).click();expect(await page.getByRole('dialog').count()).toBe(0);
},undefined,true,true),15000);

it('failed Organization save keeps the draft and unsaved warning',()=>mounted('organization',async page=>{
 await page.getByLabel('Company name',{exact:true}).fill('Retain my draft');await page.getByRole('button',{name:'Save company directory',exact:true}).click();await page.getByText('Directory changed. Refresh before saving again.',{exact:true}).waitFor();expect(await page.getByLabel('Company name',{exact:true}).inputValue()).toBe('Retain my draft');await page.getByText('Unsaved changes.',{exact:false}).waitFor();await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('dialog',{name:'Discard unsaved changes?',exact:true}).waitFor();
},'company-save',true,true),15000);


it("Connections opens an exact saved agent version in its detail drawer",()=>mounted('agents',async(page,calls)=>{
 await page.getByRole('dialog').waitFor();
 await expect.poll(()=>calls.some(c=>c.body?.operation==='history'&&c.body.version==='1'),{timeout:4000}).toBe(true);
 expect(calls.some(c=>c.body?.operation==='onboard'||c.body?.operation==='decide')).toBe(false);
},undefined,false,false,false,'?'+new URLSearchParams({connectionId:'aws-test',resourceArn:arn,version:'1',delayEnrollment:'1'})),15000);
it("an unknown linked version offers connection review instead of opening another deployment",()=>mounted('agents',async page=>{
 await page.getByRole('alert').filter({hasText:'linked deployment is not'}).waitFor();expect(await page.getByRole('dialog').count()).toBe(0);
},undefined,false,false,false,'?'+new URLSearchParams({connectionId:'aws-test',resourceArn:arn,version:'999'})),15000);

it('execution drawer separates summary, business context and timeline without changing approvals',()=>mounted('activity',async(page,calls)=>{
 await mkdir('.local/execution-detail-hierarchy',{recursive:true});
 await page.getByRole('button',{name:/25% discount/}).click();
 await page.getByText('USD 900.00',{exact:true}).waitFor();
 expect(await page.locator('.aws-business-impact').getByText('Awaiting a reviewer’s decision',{exact:true}).isVisible()).toBe(true);
 expect(await page.locator('.aws-business-impact').getByText('policy-2',{exact:true}).isVisible()).toBe(true);
 const summary=page.getByRole('region',{name:'Request summary',exact:true});
 expect(await summary.innerText()).toContain('25% discount');
 const title=summary.locator('h4');
 expect(await title.evaluate(e=>getComputedStyle(e).fontSize)).toBe('24px');
 expect(await page.locator('.aws-execution-section-heading h4').first().evaluate(e=>getComputedStyle(e).fontWeight)).toBe('600');
 expect(await page.locator('.aws-timeline-title time').first().evaluate(e=>getComputedStyle(e).fontSize)).toBe('16px');
 expect(await page.getByRole('region',{name:'Execution timeline'}).isVisible()).toBe(true);
 const evidence=page.locator('.aws-execution-evidence');expect(await evidence.getAttribute('open')).toBe(null);
 await evidence.locator('summary').click();await evidence.getByText('This trace does not independently verify its effects.',{exact:false}).waitFor();
 await evidence.locator('summary').click();
 await summary.scrollIntoViewIfNeeded();
 await page.locator('[role=dialog]').evaluate(e=>e.scrollTop=0);
 await page.screenshot({path:'.local/execution-detail-hierarchy/desktop.png',fullPage:true});
 await writeFile('.local/execution-detail-hierarchy/preview.html','<meta charset="utf-8"><title>LoopLabs — Execution detail preview (sample data)</title>'+(await page.content()).replace(/<script[\s\S]*?<\/script>/g,''));
 await page.setViewportSize({width:390,height:900});
 expect(await page.locator('[role=dialog]').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
 await page.screenshot({path:'.local/execution-detail-hierarchy/mobile.png',fullPage:true});
 expect(calls.some(c=>c.body?.operation==='decide')).toBe(false);
},'pending'),20000);

it('discovered agent opens minimal onboarding and consent stays aligned beside its label',()=>mounted('agents',async(page,calls)=>{
 await mkdir('.local/agent-drawer-hierarchy',{recursive:true});
 await page.getByRole('button',{name:/partner quote/i}).click();
 await page.getByRole('heading',{name:'Complete agent onboarding',exact:true}).waitFor();
 await page.getByLabel('Agent name',{exact:true}).waitFor();
 expect(await page.getByRole('navigation',{name:'Agent details'}).count()).toBe(0);
 expect(await page.getByRole('heading',{name:'Agent activity',exact:true}).isVisible()).toBe(false);
 await writeFile('.local/agent-drawer-hierarchy/preview.html','<meta charset="utf-8"><title>LoopLabs — Agent onboarding preview (sample data)</title>'+(await page.content()).replace(/<script[\s\S]*?<\/script>/g,''));
 const consent=page.getByRole('checkbox');
 const box=await consent.boundingBox();const text=await page.locator('.aws-onboarding-consent span').boundingBox();
 expect(box?.width).toBe(18);expect(box?.height).toBe(18);expect(text!.x).toBeGreaterThan(box!.x+box!.width);expect(Math.abs(text!.y-box!.y)).toBeLessThan(5);
 await page.getByLabel('Accountable owner',{exact:true}).selectOption('raj@example.test');
 await page.getByLabel('CloudWatch workflow log group',{exact:true}).fill('/company/events');
 expect(await page.locator('.aws-onboarding-form').evaluate(e=>(e as HTMLFormElement).checkValidity())).toBe(false);
 await consent.check();expect(await page.locator('.aws-onboarding-form').evaluate(e=>(e as HTMLFormElement).checkValidity())).toBe(true);expect(await page.getByRole('button',{name:'Onboard for observation',exact:true}).isEnabled()).toBe(true);
 await page.locator('[role=dialog]').evaluate(e=>e.scrollTop=0);
 await page.screenshot({path:'.local/agent-drawer-hierarchy/onboarding-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:900});expect(await page.locator('[role=dialog]').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
 await page.screenshot({path:'.local/agent-drawer-hierarchy/onboarding-mobile.png',fullPage:true});
 expect(calls.some(c=>['onboard','decide','history'].includes(String(c.body?.operation)))).toBe(false);
},'discovered'),15000);

it('stale discovered agents require refreshed discovery before offering onboarding',()=>mounted('agents',async(page,calls)=>{
 await page.getByRole('button',{name:/partner quote/i}).click();await page.getByText('Discovery needs a refresh before new onboarding.',{exact:false}).waitFor();
 expect(await page.getByLabel('Agent name',{exact:true}).count()).toBe(0);expect(await page.getByRole('link',{name:'Review connection',exact:true}).getAttribute('href')).toBe('/control-plane/connectors');
 expect(calls.some(c=>['onboard','decide','history'].includes(String(c.body?.operation)))).toBe(false);
},'discovered-stale'),15000);

it.each(['accounts','company'] as const)('Overview waits for %s before showing counts or empty states',source=>mounted('overview',async(page,calls,releaseLoading)=>{
 await mkdir('.local/overview-loading',{recursive:true});
 expect(await page.getByRole('region',{name:'Overview data'}).getAttribute('aria-busy')).toBe('true');
 expect(await page.locator('.cc-admin-stats').count()).toBe(0);expect(await page.locator('.cc-overview-empty').count()).toBe(0);
 expect(await page.getByRole('button',{name:'Reading…',exact:true}).isEnabled()).toBe(false);
 await page.screenshot({path:'.local/overview-loading/'+source+'-desktop.png',fullPage:true});
 await writeFile('.local/overview-loading/preview.html','<meta charset="utf-8"><title>LoopLabs — Overview loading preview</title>'+(await page.content()).replace(/<script[\s\S]*?<\/script>/g,''));
 await page.setViewportSize({width:390,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(await page.locator('.cc-skeleton').first().evaluate(e=>getComputedStyle(e).animationName)).toBe('none');
 await page.screenshot({path:'.local/overview-loading/'+source+'-mobile.png',fullPage:true});
 releaseLoading();await page.getByText('On-demand read',{exact:false}).waitFor();
 expect(await page.locator('.cc-overview-loading').count()).toBe(0);expect(await page.locator('.cc-admin-stats').isVisible()).toBe(true);
 expect(await page.getByRole('button',{name:'Refresh view',exact:true}).isEnabled()).toBe(true);
 expect(calls.some(c=>c.body?.operation==='decide')).toBe(false);
},undefined,true,false,false,'?inspectLoading='+source),15000);
it('failed Overview read leaves loading and shows incomplete coverage rather than waiting forever',()=>mounted('overview',async(page,_calls,releaseLoading)=>{
 releaseLoading();await page.getByText('AWS account …9012: Access refused',{exact:true}).waitFor();
 expect(await page.locator('.cc-overview-loading').count()).toBe(0);expect(await page.getByRole('button',{name:'Refresh view',exact:true}).isEnabled()).toBe(true);
 await page.getByRole('heading',{name:'Approval coverage is incomplete',exact:true}).waitFor();
},'inventory',false,false,false,'?inspectLoading=accounts'),15000);
it('Overview refresh returns to skeletons until the new read settles',()=>mounted('overview',async page=>{
 let releaseRead=()=>{};const hold=new Promise<void>(resolve=>{releaseRead=resolve;});
 await page.route('https://control-center.test/api/workspace/discovery',async route=>{await hold;await route.fallback();});
 await page.getByRole('button',{name:'Refresh view',exact:true}).click();await page.getByText('Loading your workspace…',{exact:true}).waitFor();
 expect(await page.locator('.cc-admin-stats').count()).toBe(0);
 releaseRead();await page.getByText('On-demand read',{exact:false}).waitFor();expect(await page.locator('.cc-admin-stats').isVisible()).toBe(true);
}),15000);

it('does not attach a same-run approval when its request ID differs from reported history',()=>mounted('activity',async(page,calls)=>{
 await page.getByRole('button',{name:/25% discount/}).click();
 await page.getByText('No unique approval readback matched this execution.',{exact:true}).waitFor();
 expect(await page.locator('.aws-business-impact').getByText('USD 1200.00',{exact:true}).count()).toBe(0);
 expect(await page.locator('.aws-business-impact').getByText('manager@example.test',{exact:true}).count()).toBe(0);
 expect(calls.every(c=>c.body?.operation!=='decide')).toBe(true);
},'impact-id-mismatch'),15000);
