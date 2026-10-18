import {expect,it} from "vitest";
import {chromium,type Page} from "@playwright/test";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
const requireModule=createRequire(import.meta.url);
const connectionId="acme-aws",arn="arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/quote-agent",other=arn.replace("quote-agent","support-agent");
const enrollment={displayName:"Quote approval agent",owner:"owner@example.test",logGroup:"/company/events",enrolledAt:new Date().toISOString()};
type Call={path:string;body:Record<string,unknown>|null};
async function mounted(run:(page:Page,calls:Call[])=>Promise<void>,options:{query?:string;failEnrollment?:boolean;failHistory?:boolean;failInventory?:boolean;latestEnrolled?:boolean}={}){
 const esbuild=requireModule(requireModule.resolve("esbuild",{paths:[requireModule.resolve("@temporalio/worker")]}));
 const bundle=await esbuild.build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{ConnectionsDiscovery}from'./components/control-plane/connections-discovery';createRoot(document.getElementById('app')).render(<ConnectionsDiscovery enabled/>);`,loader:"tsx",resolveDir:process.cwd()},bundle:true,platform:"browser",format:"iife",write:false,outfile:"memory/connections.js",jsx:"automatic",alias:{"@":resolve(".")},define:{"process.env":"{}","process.env.NODE_ENV":'"test"'}});
 const browser=await chromium.launch({headless:true}),calls:Call[]=[];
 try{const page=await browser.newPage({viewport:{width:1200,height:1000}});page.setDefaultTimeout(4000);await page.route("https://connections.test/**",async route=>{
   const url=new URL(route.request().url()),path=url.pathname,body=route.request().method()==="POST"?route.request().postDataJSON():null;
   if(path==="/")return route.fulfill({contentType:"text/html",body:'<div class="cp-app"><div class="cp-durable" id="app"></div></div>'});
   calls.push({path,body});let value:unknown={},status=200;
   if(path==="/api/workspace/discovery"){
    if(url.searchParams.has("connectionId")){if(options.failInventory){status=403;value={error:"Inventory access refused"};}else value={status:"observed",scanId:"scan-owned",stale:false,records:[{record:{resourceArn:arn,resourceId:"quote-agent",version:"16",declaredMetadata:{schemaVersion:"2",source:"aws-runtime-declaration",purpose:"Latest deployment purpose",organization:null,ownerOrganization:null,ownerTeam:null,environment:null,onCallStatus:null,metadataVersion:"16"}},observedInCurrentScan:true,stale:false},{record:{resourceArn:arn,resourceId:"quote-agent",version:"15"},observedInCurrentScan:false,stale:true},{record:{resourceArn:other,resourceId:"support-agent",version:"2"},observedInCurrentScan:true,stale:false}]};}
    else value={connections:[{scope:{connectionId,accountId:"123456789012",region:"us-west-2"}}]};
   }else if(path.endsWith("/onboarding")){
    if(body?.operation==="enrollment"){if(options.failEnrollment){status=503;value={error:"Enrollment read unavailable"};}else value={enrollment:body.resourceArn===arn&&(body.version==="15"||options.latestEnrolled&&body.version==="16")?enrollment:null};}
    else if(body?.operation==="history"){if(options.failHistory){status=429;value={error:"History read throttled"};}else value={events:[]};}
    else {status=400;value={error:"Unexpected operation"};}
   }else if(path.endsWith("/owners"))value={owners:[{email:"owner@example.test",name:"Accountable owner"}]};
   return route.fulfill({status,contentType:"application/json",body:JSON.stringify(value)});
  });await page.goto('https://connections.test/'+(options.query??""));await page.addStyleTag({content:await readFile("app/control-plane/control-plane.css","utf8")+await readFile("components/control-plane/connections-discovery.css","utf8")});await page.addScriptTag({content:bundle.outputFiles.find((file:{path:string})=>file.path.endsWith(".js")).text});await run(page,calls);
 }finally{await browser.close();}
}
it("one row per runtime retains enrolled v15, offers v16 review and sends no history reads by default",async()=>mounted(async(page,calls)=>{
 await page.getByRole("link",{name:"Open agent",exact:true}).waitFor();expect(await page.locator(".connections-agent").count()).toBe(2);
 expect(await page.getByRole("link",{name:"Open agent",exact:true}).getAttribute("href")).toContain("version=15");
 await page.getByRole("button",{name:"Review version 16 update",exact:true}).click();await page.getByRole("heading",{name:"Connect this agent’s history",exact:true}).waitFor();expect(await page.getByText("Latest deployment purpose",{exact:true}).isVisible()).toBe(true);
 expect(calls.filter(c=>c.body?.operation==="history")).toHaveLength(0);expect(calls.some(c=>c.body?.operation==="enrollment"&&c.body.version==="16")).toBe(true);
 expect(await page.getByRole("link",{name:"Open agent details",exact:true}).getAttribute("href")).toContain("version=16");
 expect(await page.getByRole("heading",{name:"Agent activity",exact:true}).isVisible()).toBe(false);
 expect(calls.every(c=>!c.body||c.body.operation==="enrollment")).toBe(true);
}),20000);
it("Overview history-gap entry excludes a successful read and keeps an unconnected deployment",async()=>mounted(async(page,calls)=>{
 await page.getByText("History not connected",{exact:true}).waitFor();await page.getByRole("status").waitFor({state:"hidden"});
 expect(await page.locator(".connections-agent").count()).toBe(1);expect(await page.locator(".connections-agent").innerText()).toContain("support-agent");
 expect(calls.filter(c=>c.body?.operation==="history")).toHaveLength(1);
},{query:"?coverage=history",latestEnrolled:true}),20000);
it("history read failure remains a visible gap, never an empty or successful result",async()=>mounted(async(page)=>{
 await page.getByText("History read failed",{exact:true}).waitFor();expect(await page.locator(".connections-agent").count()).toBe(2);expect(await page.getByRole("alert").innerText()).toContain("History read throttled");
},{query:"?coverage=history",failHistory:true,latestEnrolled:true}),20000);
it("failed enrollment does not offer an Open agent link or claim saved onboarding",async()=>mounted(async(page)=>{
 await page.getByRole("status").waitFor({state:"hidden"});expect(await page.getByRole("link",{name:"Open agent",exact:true}).count()).toBe(0);expect(await page.getByText("Connection needs review",{exact:true}).count()).toBe(2);
},{failEnrollment:true}),20000);
it("legacy exact-version context opens its setup only after authorized inventory lookup",async()=>mounted(async(page,calls)=>{
 await page.getByRole("heading",{name:"Agent workspace",exact:true}).waitFor();expect(await page.getByLabel("CloudWatch workflow log group",{exact:true}).isVisible()).toBe(false);
 expect(calls.some(c=>c.body?.operation==="enrollment"&&c.body.version==="15")).toBe(true);expect(calls.some(c=>c.body?.operation==="history")).toBe(false);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
},{query:'?'+new URLSearchParams({connectionId,resourceArn:arn,version:"15"})}),20000);
it("foreign linked resources never trigger enrollment lookups or open a review drawer",async()=>mounted(async(page,calls)=>{
 await page.getByRole("alert").filter({hasText:"linked agent is not"}).waitFor();expect(await page.getByRole("dialog").count()).toBe(0);expect(calls.some(c=>c.body?.resourceArn===arn.replace("123456789012","999999999999"))).toBe(false);
},{query:'?'+new URLSearchParams({connectionId,resourceArn:arn.replace("123456789012","999999999999"),version:"15"})}),20000);

it("an older version’s saved history does not hide the latest deployment’s coverage gap",async()=>mounted(async(page,calls)=>{
 await page.getByRole("status").waitFor({state:"hidden"});expect(await page.locator(".connections-agent").count()).toBe(2);expect(calls.some(c=>c.body?.operation==="history")).toBe(false);
 expect(await page.getByRole("link",{name:"Open agent",exact:true}).count()).toBe(0);
},{query:"?coverage=history"}),20000);

it("account management only exposes account and discovery steps, without restoring the old operational workspace",async()=>mounted(async(page,calls)=>{
 await page.getByRole("button",{name:"Manage AWS accounts",exact:true}).click();
 await page.getByRole("heading",{name:"AWS account setup",exact:true}).waitFor();
 expect(await page.getByRole("button",{name:"3 Review activity",exact:true}).count()).toBe(0);
 expect(await page.getByRole("button",{name:"4 Onboard agent",exact:true}).count()).toBe(0);
 expect(await page.getByRole("heading",{name:"Know what is connected",exact:true}).count()).toBe(0);
 expect(calls.some(c=>c.body?.operation==="history"||c.body?.operation==="list")).toBe(false);
}),20000);
