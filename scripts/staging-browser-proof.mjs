// Real Chromium over trusted TLS to the disposable stack. Prepared-plan UI proof,
// not fresh model interpretation, remote persistent staging or live delivery.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFile,writeFile,mkdir,access} from "node:fs/promises";
import {join} from "node:path";
import {homedir} from "node:os";
import {randomBytes,randomUUID,createHash} from "node:crypto";
import {chromium,expect} from "@playwright/test";
import {createServer} from "node:https";
import {browserCertificates,browserTLSBridge,browserOrigin as origin} from "./staging-browser-tls.mjs";
export async function stagingBrowserProof(directory){
 assert(process.platform==="linux"&&process.env.GITHUB_ACTIONS==="true"&&process.env.LOOPLABS_STAGING_BROWSER_PROOF==="isolated","Fresh isolated Linux CI browser opt-in required");
 const tls=await browserCertificates(join(directory,"browser-tls"));
 const decisions=[];const relay=browserTLSBridge(tls,{observeDecision:record=>decisions.push(record)});await new Promise((resolve,reject)=>{relay.once("error",reject);relay.listen(3443,"127.0.0.1",resolve);});
 let browser,hostile,imported=false,phase="certificate-refusal";const nickname=`ll-browser-proof-${randomBytes(10).toString("hex")}`;let nss;
 const certutil=(...args)=>execFileSync("certutil",["-d",`sql:${nss}`,...args],{stdio:"ignore",timeout:15000});
 const launch=()=>chromium.launch({headless:true,args:["--no-proxy-server","--host-resolver-rules=MAP looplabs-staging.example.test 127.0.0.1"]});
 try{
  // No bypass flags/ignoreHTTPSErrors: the same browser must reject the untrusted CA.
  browser=await launch();const untrusted=await browser.newContext({ignoreHTTPSErrors:false});
  await assert.rejects(() => untrusted.newPage().then(p=>p.goto(origin+"/sign-in")),error=>String(error).includes("ERR_CERT_AUTHORITY_INVALID"));
  const major=Number(browser.version().split(".")[0]);
  // Chromium M146 changed its default NSS path; an existing legacy DB wins.
  // https://chromium.googlesource.com/chromium/src/+/main/docs/linux/cert_management.md
  const legacy=join(homedir(),".pki/nssdb");nss=major>=146?join(homedir(),".local/share/pki/nssdb"):legacy;
  try{await access(join(legacy,"cert9.db"));nss=legacy;}catch{}
  await browser.close();browser=undefined;
  await mkdir(nss,{recursive:true,mode:0o700});
  try{await access(join(nss,"cert9.db"));}catch{certutil("-N","--empty-password");}
  phase="certificate-trust";certutil("-A","-n",nickname,"-t","C,,","-i",join(directory,"browser-tls/ca.pem"));imported=true;
  browser=await launch();const owner=await browser.newContext({ignoreHTTPSErrors:false}),reviewer=await browser.newContext({ignoreHTTPSErrors:false}),anonymous=await browser.newContext({ignoreHTTPSErrors:false});
  const accounts=JSON.parse(await readFile(join(directory,"accounts.json"),"utf8")).accounts;
  const saved=JSON.parse(await readFile(join(directory,"browser-run.json"),"utf8"));
  const ownerPage=await owner.newPage(),reviewerPage=await reviewer.newPage(),anonPage=await anonymous.newPage();
  const json=async(page,path,data)=>page.evaluate(async({path,data})=>{const r=await fetch(path,{...(data?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)}:{})});return {status:r.status,value:await r.json()};},{path,data});
  await anonPage.goto(origin+"/sign-in");assert.equal((await json(anonPage,"/api/workspace/records")).status,401);
  async function login(page,account){
   const response=await page.goto(origin+"/sign-in?next=/control-plane/records");
   assert.equal((await response.securityDetails()).issuer,"LoopLabs disposable browser proof CA");
   assert(await page.evaluate(()=>window.isSecureContext));
   await page.getByLabel("Email",{exact:true}).fill(account.email);await page.getByLabel("Password").fill(account.password);
   const signed=page.waitForResponse(r=>r.url().endsWith("/api/workspace/session")&&r.request().method()==="POST");
   await page.getByRole("button",{name:"Sign in",exact:true}).click();assert.equal((await signed).status(),200);
   await expect(page.getByRole("heading",{name:"Records and access",exact:true})).toBeVisible();
   const cookie=(await page.context().cookies()).find(c=>c.name==="looplabs_workspace_session");assert(cookie?.secure&&cookie.httpOnly&&cookie.sameSite==="Strict");
   assert(!(await page.evaluate(()=>document.cookie)).includes(cookie.value));return cookie.value;
  }
  phase="named-sign-in";assert.notEqual(await login(ownerPage,accounts[0]),await login(reviewerPage,accounts[1]));
  const id=randomUUID(),path=`/api/workspace/enquiries?scope=${saved.scope}`;
  phase="prepared-plan";const prepared=await json(ownerPage,path,{operation:"prepare",id,fixtureId:"service"});assert.equal(prepared.status,200);
  async function open(page){await page.goto(origin+"/control-plane/work");await page.getByLabel("Customer record for this conversation").selectOption(saved.scope);await page.getByRole("button",{name:new RegExp(id.slice(0,8))}).click();}
  phase="record-opening";await open(ownerPage);
  phase="agent-selection";
  await ownerPage.getByLabel(/^CRM agent/).selectOption("trial-crm");await ownerPage.getByLabel(/^Messaging agent/).selectOption("trial-email");
  phase="review-submit";await ownerPage.getByRole("checkbox").check();
  const submitted=ownerPage.waitForResponse(r=>r.url().includes("/api/workspace/enquiries")&&r.request().method()==="POST");
  await ownerPage.getByRole("button",{name:"Submit for independent approval",exact:true}).click();assert.equal((await submitted).status(),200);
  await expect(ownerPage.getByText("A different workspace member must approve.",{exact:false}).first()).toBeVisible();
  assert.equal(await ownerPage.getByRole("button",{name:"Approve CRM update",exact:true}).count(),0);
  const held=(await json(ownerPage,`/api/durable/workflows?run=${id}`)).value;assert(held.steps.every(s=>s.state==="held"));
  phase="self-approval";const self=await json(ownerPage,"/api/durable/connectors",{operation:"approve",actionId:held.steps[0].action_id,payloadHash:held.steps[0].payload_hash});assert.equal(self.status,403);
  phase="hostile-origin";
  const attack={operation:"approve",actionId:held.steps[0].action_id,payloadHash:held.steps[0].payload_hash};
  hostile=createServer({...tls,minVersion:"TLSv1.2"},(_req,res)=>{res.setHeader("Content-Type","text/html");res.end(`<script>fetch(${JSON.stringify(origin+"/api/durable/connectors")},{method:"POST",credentials:"include",headers:{"Content-Type":"text/plain"},body:${JSON.stringify(JSON.stringify(attack))}}).catch(()=>{})</script>`);});
  await new Promise((resolve,reject)=>{hostile.once("error",reject);hostile.listen(3444,"127.0.0.1",resolve);});
  const hostilePage=await reviewer.newPage();
  const reviewerCookie=(await reviewer.cookies()).find(c=>c.name==="looplabs_workspace_session");assert(reviewerCookie);
  const sessionDigest=createHash("sha256").update(reviewerCookie.value).digest("hex");
  await hostilePage.goto("https://looplabs-staging.example.test:3444");
  // CORS correctly hides the response from page JavaScript and may suppress the
  // browser response event. Observe the actual backend reply through the fixed
  // TLS relay; do not add CORS permission or weaken the authenticated-origin gate.
  await expect.poll(()=>decisions.some(r=>r.hostileOrigin&&r.sessionDigest===sessionDigest),{timeout:15000}).toBe(true);
  const refusal=decisions.find(r=>r.hostileOrigin&&r.sessionDigest===sessionDigest);assert.equal(refusal.status,403);assert.equal(refusal.sameOriginDenied,true);
  assert((await json(ownerPage,`/api/durable/workflows?run=${id}`)).value.steps.every(s=>s.state==="held"));await hostilePage.close();
  phase="independent-review";await open(reviewerPage);
  for(const name of ["Approve CRM update","Approve acknowledgement"]){const r=reviewerPage.waitForResponse(r=>r.url().endsWith("/api/durable/connectors")&&r.request().method()==="POST");await reviewerPage.getByRole("button",{name,exact:true}).click();assert.equal((await r).status(),200);}
  phase="verified-completion";await expect(reviewerPage.getByRole("heading",{name:"Acknowledgement verified",exact:true})).toBeVisible({timeout:120000});
  const completed=(await json(reviewerPage,`/api/durable/workflows?run=${id}`)).value;assert.equal(completed.state,"completed");
  assert(completed.steps.every(s=>s.state==="succeeded"&&s.approved_by===accounts[1].email&&s.evidence?.outcome==="verified"));
  phase="mobile-reload";await ownerPage.setViewportSize({width:390,height:844});await open(ownerPage);
  await expect(ownerPage.getByRole("heading",{name:"Acknowledgement verified",exact:true})).toBeVisible();
  assert(await ownerPage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  await expect(ownerPage.getByText("To: customer@example.test",{exact:true})).toBeVisible();
  // Actual HTTPS/browser cookie policy, not manually injected Cookie headers.
  phase="http-refusal";const plain=await ownerPage.goto("http://looplabs-staging.example.test:3199/api/workspace/session");assert.equal(plain.status(),401);
  return {passed:true,scope:"trusted HTTPS Chromium prepared-plan review/approval over disposable assembled runtime",checks:["untrusted CA refused before sign-in","trusted CA and secure browser context","separate named form sign-ins with Secure/HttpOnly/Strict cookies","anonymous and requester self-approval refusal","real hostile-origin browser POST with reviewer cookie refused before approval","UI exact-plan review, scoped agent selection and submission","independent UI approvals and actual verified completion","saved outcome and exact recipient survive 390px reload without overflow","Secure session cookie not sent over plain HTTP"],actionIds:completed.steps.map(s=>s.action_id),notVerified:["fresh typed chat/model interpretation","persistent remote staging","live-provider delivery","sustained tenant load, restore and operator acceptance"]};
 }catch{await writeFile(join(directory,"browser-failure.json"),JSON.stringify({phase}),{mode:0o600});throw Error("Prepared browser proof failed; no credential or page content printed");}finally{
  try{await browser?.close();}finally{try{if(imported)certutil("-D","-n",nickname);}finally{hostile?.closeAllConnections();relay.closeAllConnections();await Promise.all([new Promise(resolve=>relay.close(resolve)),hostile&&new Promise(resolve=>hostile.close(resolve))]);}}
 }
}
