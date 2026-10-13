import {privateBrowserFailure} from './staging-browser-failure.mjs';
import {authenticatedRecording} from './authenticated-ui-recording.mjs';
import {actualInstalledDiagnosticRunner} from './installed-diagnostic-runner.mjs';
// Real Chromium over trusted TLS to the disposable stack. Typed mode invokes
// the bounded planner; neither mode proves persistent staging or live delivery.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFile,writeFile,mkdir,access} from "node:fs/promises";
import {join} from "node:path";
import {homedir} from "node:os";
import {randomBytes,randomUUID,createHash} from "node:crypto";
import {chromium,expect} from "@playwright/test";
import {createServer} from "node:https";
import {browserCertificates,browserTLSBridge,browserOrigin as origin} from "./staging-browser-tls.mjs";
export async function stagingBrowserProof(directory,{typedPlanning=false}={}){
 assert(typeof typedPlanning==="boolean","Explicit typed planning mode required");
 actualInstalledDiagnosticRunner();assert(process.env.LOOPLABS_STAGING_BROWSER_PROOF==="isolated","Explicit isolated browser opt-in required");
 const tls=await browserCertificates(join(directory,"browser-tls"));
 const decisions=[];const relay=browserTLSBridge(tls,{observeDecision:record=>decisions.push(record)});await new Promise((resolve,reject)=>{relay.once("error",reject);relay.listen(3443,"127.0.0.1",resolve);});
 const recordings=[],privateSecrets=[];let browser,hostile,imported=false,phase="certificate-refusal";const nickname=`ll-browser-proof-${randomBytes(10).toString("hex")}`;let nss,lastHttpStatus=null;
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
  browser=await launch();let owner=await browser.newContext({ignoreHTTPSErrors:false}),reviewer=await browser.newContext({ignoreHTTPSErrors:false});const anonymous=await browser.newContext({ignoreHTTPSErrors:false});
  const accounts=JSON.parse(await readFile(join(directory,"accounts.json"),"utf8")).accounts;
  privateSecrets.push(...accounts.flatMap(account=>[account.email,account.password]));
  const saved=JSON.parse(await readFile(join(directory,"browser-run.json"),"utf8"));
  let ownerPage=await owner.newPage(),reviewerPage=await reviewer.newPage();const anonPage=await anonymous.newPage();
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
   assert(!(await page.evaluate(()=>document.cookie)).includes(cookie.value));privateSecrets.push(cookie.value);return cookie.value;
  }
  phase="named-sign-in";assert.notEqual(await login(ownerPage,accounts[0]),await login(reviewerPage,accounts[1]));
  const requesterRecording=await authenticatedRecording(browser,owner,{directory,role:'ack-requester',viewport:{width:1280,height:900}});recordings.push(requesterRecording);owner=requesterRecording.context;ownerPage=requesterRecording.page;await ownerPage.goto(origin+'/control-plane/records');
  const reviewerRecording=await authenticatedRecording(browser,reviewer,{directory,role:'ack-reviewer',viewport:{width:1280,height:900}});recordings.push(reviewerRecording);reviewer=reviewerRecording.context;reviewerPage=reviewerRecording.page;await reviewerPage.goto(origin+'/control-plane/records');
  let id=randomUUID();const path=`/api/workspace/enquiries?scope=${saved.scope}`;
  let planning;
  if(typedPlanning){
   phase="typed-request";await ownerPage.goto(origin+"/control-plane/work");await selectRecord(ownerPage);
   async function turn(text,doubleSubmit=false){await ownerPage.getByLabel("Your request or clarification").fill(text);const response=ownerPage.waitForResponse(r=>r.url().includes("/api/workspace/enquiries")&&r.request().method()==="POST");const send=ownerPage.getByRole("button",{name:"Send request",exact:true});if(doubleSubmit)await send.evaluate(button=>{button.click();button.click();});else await send.click();const r=await response;lastHttpStatus=r.status();assert.equal(r.status(),200);assert.equal(r.request().postDataJSON().operation,"chat");return r.json();}
   let releaseRequest, intercepted=false, chatRequests=0;
   const release=new Promise(resolve=>{releaseRequest=resolve;});
   const chatRoute=async route=>{if(route.request().method()==="POST"&&route.request().postDataJSON().operation==="chat"){chatRequests++;intercepted=true;await release;}await route.continue();};
   await ownerPage.route("**/api/workspace/enquiries*",chatRoute);
   const text="When a customer asks about our service, check their CRM record, prepare an acknowledgement, and ask me before sending. Validate it with simulated systems first.";
   const firstResponse=turn(text,true);
   try {
    await expect.poll(()=>intercepted,{timeout:15000}).toBe(true);
    await expect(ownerPage.getByRole("log",{name:"Workflow conversation"}).getByText(text,{exact:true})).toBeVisible();
    await expect(ownerPage.getByRole("status").filter({hasText:"Preparing your plan…"})).toBeVisible();
    await expect(ownerPage.getByRole("button",{name:"Preparing…",exact:false})).toBeDisabled();
    assert.equal(await ownerPage.getByRole("log",{name:"Workflow conversation"}).locator("article").count(),2);
    assert.equal(chatRequests,1,"Synchronous double-submit must send exactly one planning request");
    await expect(ownerPage.getByRole("button",{name:"Preparing…",exact:false})).toBeDisabled();
   } finally { releaseRequest(); }
   const first=await firstResponse;assert.equal(chatRequests,1,"Pending submission must not generate another planning request");await ownerPage.unroute("**/api/workspace/enquiries*",chatRoute);assert(first.clarification&&!first.saved);
   await expect(ownerPage.getByRole("log",{name:"Workflow conversation"}).locator("article")).toHaveCount(2);
   await expect(ownerPage.getByRole("status").filter({hasText:"Preparing your plan…"})).toHaveCount(0);
   phase="typed-clarification";const second=await turn("Use customer@example.test for this workflow. Keep ask-first approval.");assert(second.saved?.id&&second.saved.run_id===null);id=second.saved.id;
   assert.equal(second.saved.plan.reply.recipient,"customer@example.test");assert.equal(second.saved.plan.recordEnrollment.id,saved.scope);
   await expect(ownerPage.getByRole("heading",{name:"Review this exact plan",exact:true})).toBeVisible();
   const beforeSubmission=await json(ownerPage,`/api/durable/workflows?run=${id}`);assert.equal(beforeSubmission.status,404);
   planning={typedRequest:true,clarified:true,model:"us.amazon.nova-lite-v1:0",savedBeforeSubmission:true};
  }else{phase="prepared-plan";const prepared=await json(ownerPage,path,{operation:"prepare",id,fixtureId:"service"});assert.equal(prepared.status,200);}
  async function selectRecord(page){await page.locator("details.cp-chat-setup > summary").click();await page.getByLabel("Customer record for this conversation").selectOption(saved.scope);}
  async function open(page){await page.goto(origin+"/control-plane/work");await selectRecord(page);const activity=page.getByRole("button",{name:"Activity",exact:true});if(await activity.isVisible())await activity.click();await page.getByRole("button",{name:new RegExp(id.slice(0,8))}).click();}
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
  await ownerPage.screenshot({path:join(directory,'ack-requester-mobile.png'),fullPage:true});await reviewerPage.screenshot({path:join(directory,'ack-reviewer-desktop.png'),fullPage:true});
  // Actual HTTPS/browser cookie policy, not manually injected Cookie headers.
  phase="http-refusal";const plain=await ownerPage.goto("http://looplabs-staging.example.test:3199/api/workspace/session");assert.equal(plain.status(),401);
  return {passed:true,scope:typedPlanning?"trusted HTTPS Chromium fresh typed planning/review/approval over disposable assembled runtime":"trusted HTTPS Chromium prepared-plan review/approval over disposable assembled runtime",...(planning?{planning}:{}),checks:[...(planning?["real typed request and missing-recipient clarification save an exact scoped plan without execution authority"]:[]),"untrusted CA refused before sign-in","trusted CA and secure browser context","separate named form sign-ins with Secure/HttpOnly/Strict cookies","anonymous and requester self-approval refusal","real hostile-origin browser POST with reviewer cookie refused before approval","UI exact-plan review, scoped agent selection and submission","independent UI approvals and actual verified completion","saved outcome and exact recipient survive 390px reload without overflow","Secure session cookie not sent over plain HTTP"],actionIds:completed.steps.map(s=>s.action_id),notVerified:[...(typedPlanning?[]:["fresh typed chat/model interpretation"]),"persistent remote staging","live-provider delivery","sustained tenant load, restore and operator acceptance"]};
 }catch(error){
  await writeFile(join(directory,"browser-failure.json"),JSON.stringify({phase,...(Number.isInteger(lastHttpStatus)?{lastChatHttpStatus:lastHttpStatus}:{})}),{mode:0o600});
  await writeFile(join(directory,"browser-private-failure.json"),JSON.stringify(privateBrowserFailure({phase,error,secrets:privateSecrets,httpStatus:lastHttpStatus}),null,2)+'\n',{mode:0o600,flag:'wx'}).catch(()=>{});
  throw Error("Prepared browser proof failed; no credential or page content printed");
 }finally{
  try{try{const finalized=await Promise.allSettled(recordings.map(recording=>recording.finish()));assert(finalized.every(result=>result.status==='fulfilled'),'Authenticated demo media finalization failed');}finally{await browser?.close();}}finally{try{if(imported)certutil("-D","-n",nickname);}finally{hostile?.closeAllConnections();relay.closeAllConnections();await Promise.all([new Promise(resolve=>relay.close(resolve)),hostile&&new Promise(resolve=>hostile.close(resolve))]);}}
 }
}
