// Reopen the same held work over real trusted HTTPS; never approve or resubmit it.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFile,mkdir,access} from "node:fs/promises";
import {join} from "node:path";
import {homedir} from "node:os";
import {randomUUID} from "node:crypto";
import {chromium,expect} from "@playwright/test";
import {browserCertificates,browserTLSBridge,browserOrigin as origin} from "./staging-browser-tls.mjs";
export async function withPendingPackageBrowser(directory,operation){
 assert(process.platform==="linux"&&process.env.GITHUB_ACTIONS==="true"&&process.env.LOOPLABS_STAGING_PACKAGE_PROOF==="isolated","Fresh isolated Linux CI required");
 assert(typeof operation==="function");
 const tls=await browserCertificates(join(directory,"pending-browser-tls")),relay=browserTLSBridge(tls);
 await new Promise((resolve,reject)=>{relay.once("error",reject);relay.listen(3443,"127.0.0.1",resolve);});
 const nickname=`ll-pending-${randomUUID()}`;
 let browser,nss,imported=false;
 const certutil=(...args)=>execFileSync("certutil",["-d",`sql:${nss}`,...args],{stdio:"ignore",timeout:15000});
 const launch=()=>chromium.launch({headless:true,args:["--no-proxy-server","--host-resolver-rules=MAP looplabs-staging.example.test 127.0.0.1"]});
 try{
  browser=await launch();const untrusted=await browser.newContext({ignoreHTTPSErrors:false});
  await assert.rejects(()=>untrusted.newPage().then(p=>p.goto(origin+"/sign-in")),e=>String(e).includes("ERR_CERT_AUTHORITY_INVALID"));
  const major=Number(browser.version().split(".")[0]),legacy=join(homedir(),".pki/nssdb");nss=major>=146?join(homedir(),".local/share/pki/nssdb"):legacy;
  try{await access(join(legacy,"cert9.db"));nss=legacy;}catch{}
  await browser.close();browser=undefined;
  await mkdir(nss,{recursive:true,mode:0o700});try{await access(join(nss,"cert9.db"));}catch{certutil("-N","--empty-password");}
  certutil("-A","-n",nickname,"-t","C,,","-i",join(directory,"pending-browser-tls/ca.pem"));imported=true;
  browser=await launch();const context=await browser.newContext({ignoreHTTPSErrors:false,viewport:{width:390,height:844}}),page=await context.newPage();
  const accounts=JSON.parse(await readFile(join(directory,"accounts.json"),"utf8")).accounts,reference=JSON.parse(await readFile(join(directory,"restore-reference.json"),"utf8"));
  assert(accounts.length===2&&reference.steps.length===2);
  const response=await page.goto(origin+"/sign-in?next=/control-plane/records");assert.equal((await response.securityDetails()).issuer,"LoopLabs disposable browser proof CA");assert(await page.evaluate(()=>window.isSecureContext));
  await page.getByLabel("Email",{exact:true}).fill(accounts[0].email);await page.getByLabel("Password").fill(accounts[0].password);
  const signed=page.waitForResponse(r=>r.url().endsWith("/api/workspace/session")&&r.request().method()==="POST");
  await page.getByRole("button",{name:"Sign in",exact:true}).click();assert.equal((await signed).status(),200);
  await expect(page.getByRole("heading",{name:"Records and access",exact:true})).toBeVisible();
  const cookie=(await context.cookies()).find(c=>c.name==="looplabs_workspace_session");assert(cookie?.secure&&cookie.httpOnly&&cookie.sameSite==="Strict");
  const catalog=await page.evaluate(async()=>{const r=await fetch("/api/workspace/records");if(r.status!==200)throw Error("Record catalog unavailable");return r.json();});
  assert(catalog.records.length===1&&catalog.records[0].active===true);const scope=catalog.records[0].id;
  let reloads=0;
  const verify=async()=>{
   await page.goto(origin+"/control-plane/work");await page.getByLabel("Customer record for this conversation").selectOption(scope);
   await page.getByRole("button",{name:new RegExp(reference.id.slice(0,8))}).click();
   await expect(page.getByText("A different workspace member must approve.",{exact:false}).first()).toBeVisible();
   assert.equal(await page.getByRole("button",{name:"Approve CRM update",exact:true}).count(),0);
   assert.equal(await page.getByRole("button",{name:"Approve acknowledgement",exact:true}).count(),0);
   const run=await page.evaluate(async id=>{const r=await fetch("/api/durable/workflows?run="+id);if(r.status!==200)throw Error("Saved run unavailable");return r.json();},reference.id);
   assert(run.id===reference.id&&run.state==="active"&&run.steps.length===2);
   for(let i=0;i<2;i++)assert(run.steps[i].action_id===reference.steps[i].action_id&&run.steps[i].payload_hash===reference.steps[i].payload_hash&&run.steps[i].state==="held"&&run.steps[i].approved_by===null,"Saved pending UI action changed");
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
   const after=(await context.cookies()).find(c=>c.name==="looplabs_workspace_session");assert(after?.value===cookie.value&&after.secure&&after.httpOnly&&after.sameSite==="Strict","Named browser session changed during transition");
   reloads++;
  };
  await operation(verify);assert.equal(reloads,3,"Baseline, promotion and reversion must each reopen pending work");
  return {trustedHTTPS:true,namedFormSession:true,sameSession:true,savedPendingReloads:3,sameActionHashes:true,heldWithoutApproval:true,noSelfApproval:true,mobileWidth:390,noHorizontalOverflow:true};
 }finally{
  try{await browser?.close();}finally{try{if(imported)certutil("-D","-n",nickname);}finally{relay.closeAllConnections();await new Promise(resolve=>relay.close(resolve));}}
 }
}
