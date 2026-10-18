/** Isolated local application quote contract fixture. No approval/orchestration or
 * hosted-provider eligibility. The caller provisions a dedicated scoped PG role. */
import {existsSync} from 'node:fs';
import { createServer, type RequestListener, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { quoteRequestIdentity, type QuoteEffect } from '../lib/quotes/effect';
import { observeQuoteEffect } from '../lib/quotes/effect';
import { NativeQuoteEmailTransport,nativeMailIdentity,type NativeMailPin } from '../lib/quotes/native-email-transport';
import type { JsonBodyRequestTransport } from '../lib/quotes/json-body-transport';
import type { Observation } from '../lib/connectors/contracts';
import { pinEnrollmentReceipt } from '../lib/quotes/native-pin-provisioner';
import { isDeepStrictEqual } from 'node:util';
import type { QuotePlan } from '../lib/quotes/plan';
export type NativeQuoteBinding = Readonly<{workspaceId:string;quoteId:string;quoteBinding:string;emailBinding:string;token:string}>;
class Refusal extends Error { constructor(readonly status:number){super('Native quote fixture request refused');} }
function equal(a:string,b:string){return timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());}
async function body(req:IncomingMessage):Promise<unknown>{let size=0;const chunks:Buffer[]=[];for await(const chunk of req){const b=Buffer.from(chunk);size+=b.length;if(size>16384)throw new Refusal(413);chunks.push(b);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Refusal(400);}}
function reply(res:ServerResponse,status:number,value:unknown){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));}
async function transaction<T>(pool:Pool,fn:(client:PoolClient)=>Promise<T>):Promise<T>{const c=await pool.connect();try{await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='3s'");await c.query("SET LOCAL statement_timeout='5s'");const value=await fn(c);await c.query('COMMIT');return value;}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}}
type NativeQuoteOptions=Readonly<{ownedContainer?:Readonly<{kind:'owned-disposable-docker';hostname:'quote-twin.looplabs.test';port:9443}>;port?:number;loseReplyActionIds?:ReadonlySet<string>;policy?:Readonly<{pool:Pool}>;mail?:Readonly<{pins:readonly NativeMailPin[];transport:JsonBodyRequestTransport;failResolutionActionIds?:ReadonlySet<string>}>;provisioner?:Readonly<{purpose:'quote-pin-provisioner';token:string;pool:Pool;enrollMail:(pin:NativeMailPin)=>Promise<unknown>}>}>;
export async function startNativeQuoteTwin(pool:Pool,input:NativeQuoteBinding,options:NativeQuoteOptions={}){return startNativeQuoteServer(pool,input,options,createServer,'http');}
export async function startNativeQuoteTlsTwin(pool:Pool,input:NativeQuoteBinding,tlsFile:string,options:NativeQuoteOptions={}){
 const {readNativeQuoteTlsGeneration}=await import('../lib/quotes/server-tls-generation');
 const {token,...scope}=input;void token;const tls=await readNativeQuoteTlsGeneration(tlsFile,scope);await tls.assertStable();
 const started=await startNativeQuoteServer(pool,input,options,tls.createServer,'https');try{await tls.assertStable();return started;}catch(e){await started.close();throw e;}
}
async function startNativeQuoteServer(pool:Pool,input:NativeQuoteBinding,options:NativeQuoteOptions,listener:(handler:RequestListener)=>Server,protocol:'http'|'https'){
 if(!/^[A-Za-z0-9_-]{1,64}$/.test(input.workspaceId)||!/^[A-Za-z0-9_-]{1,64}$/.test(input.quoteId)||!/^[a-f0-9]{64}$/.test(input.quoteBinding)||!/^[a-f0-9]{64}$/.test(input.emailBinding)||input.quoteBinding===input.emailBinding||input.token.length<32)throw Error('Exact isolated quote binding required');
 if(options.provisioner&&(options.provisioner.purpose!=='quote-pin-provisioner'||options.provisioner.token.length<32||equal(options.provisioner.token,input.token)||options.provisioner.pool===pool))throw Error('Separate narrow provider provisioner required');
 const target=nativeQuoteListenerTarget(options.ownedContainer,options.port);
 const binding=Object.freeze({...input});const lost=new Set<string>();
 const mailPins=new Map<string,NativeMailPin>();
 for(const original of options.mail?.pins??[]){const pin=structuredClone(original);if(!nativeMailIdentity(pin.messageRequest)||!quoteRequestIdentity(pin.quoteRequest)||pin.messageRequest.workspaceId!==binding.workspaceId||pin.messageRequest.quoteId!==binding.quoteId||pin.quoteRequest.binding!==binding.quoteBinding||pin.messageRequest.binding!==binding.emailBinding||mailPins.has(pin.messageRequest.idempotencyKey))throw Error('Exact unique offline mail enrollment required');mailPins.set(pin.messageRequest.idempotencyKey,pin);}
 function checkPinCollection(pins:readonly NativeMailPin[]){const messages=new Map<string,NativeMailPin>(),updates=new Map<string,NativeMailPin['quoteRequest']>();for(const pin of pins){const receipt=pinEnrollmentReceipt(pin);if(receipt.workspaceId!==binding.workspaceId||receipt.quoteId!==binding.quoteId||pin.quoteRequest.binding!==binding.quoteBinding||pin.messageRequest.binding!==binding.emailBinding||updates.has(receipt.messageActionId)||messages.has(receipt.quoteActionId)||messages.has(receipt.messageActionId)&&!isDeepStrictEqual(messages.get(receipt.messageActionId),pin)||updates.has(receipt.quoteActionId)&&!isDeepStrictEqual(updates.get(receipt.quoteActionId),pin.quoteRequest))throw Error('Contradictory retained pin collection');messages.set(receipt.messageActionId,pin);updates.set(receipt.quoteActionId,pin.quoteRequest);}}
 if(options.provisioner)checkPinCollection([...mailPins.values()]);
 if(options.provisioner){const rows=(await pool.query('SELECT message_action,quote_action,pin,pin_identity FROM native_mail_pins WHERE workspace_id=$1 AND quote_id=$2',[binding.workspaceId,binding.quoteId])).rows;if(rows.length>100)throw Error('Bounded pin collection required');for(const row of rows){const r=pinEnrollmentReceipt(row.pin);if(row.pin_identity!==r.pinDigest||row.message_action!==r.messageActionId||row.quote_action!==r.quoteActionId)throw Error('Retained pin columns differ');}checkPinCollection([...mailPins.values(),...rows.map(row=>row.pin as NativeMailPin)]);}
 async function enrolledPin(action:string){
  const offline=mailPins.get(action);if(!options.provisioner)return offline;
  const row=(await pool.query('SELECT pin,pin_identity FROM native_mail_pins WHERE workspace_id=$1 AND quote_id=$2 AND message_action=$3',[binding.workspaceId,binding.quoteId,action])).rows[0];if(!row)return offline;
  const pin=row.pin as NativeMailPin;const receipt=pinEnrollmentReceipt(pin);if(receipt.pinDigest!==row.pin_identity||pin.messageRequest.idempotencyKey!==action||receipt.workspaceId!==binding.workspaceId||receipt.quoteId!==binding.quoteId||pin.quoteRequest.binding!==binding.quoteBinding||pin.messageRequest.binding!==binding.emailBinding||offline&&!isDeepStrictEqual(offline,pin))throw new Refusal(409);return pin;
 }
 async function quoteLookup(c:PoolClient,action:string,readOnly=false){const row=(await c.query('SELECT version,result FROM native_quotes WHERE workspace_id=$1 AND quote_id=$2 '+(readOnly?'FOR SHARE':'FOR UPDATE'),[binding.workspaceId,binding.quoteId])).rows[0];if(!row)throw new Refusal(404);const effects=(await c.query('SELECT effect FROM native_quote_effects WHERE workspace_id=$1 AND quote_id=$2 AND action_id=$3',[binding.workspaceId,binding.quoteId,action])).rows.map(r=>r.effect);return{contract:'quote-effect-lookup-1',status:'available',effects,current:{workspaceId:binding.workspaceId,quoteId:binding.quoteId,sourceVersion:'v'+row.version,...row.result}};}
 const unavailable=():Observation=>({outcome:'unknown',detail:'Pending simulated email remains contained; no resend authorized.'});
 const server=listener(async(req,res)=>{try{
  if(req.url==='/quote-pins/enroll'){
   const provisioner=options.provisioner;if(!provisioner||typeof req.headers.authorization!=='string'||!equal(req.headers.authorization,'Bearer '+provisioner.token))throw new Refusal(401);
   if(req.method!=='POST'||req.headers['x-looplabs-workspace']!==binding.workspaceId||req.headers['x-looplabs-binding']!==binding.quoteBinding)throw new Refusal(403);
   const pin=await body(req) as NativeMailPin;let receipt:ReturnType<typeof pinEnrollmentReceipt>;try{receipt=pinEnrollmentReceipt(pin);}catch{throw new Refusal(409);}
   if(receipt.workspaceId!==binding.workspaceId||receipt.quoteId!==binding.quoteId||pin.quoteRequest.binding!==binding.quoteBinding||pin.messageRequest.binding!==binding.emailBinding||req.headers['idempotency-key']!==receipt.messageActionId)throw new Refusal(403);
   const retained=await transaction(pool,async c=>{
    const current=await quoteLookup(c,receipt.quoteActionId);
    const rows=(await provisioner.pool.query('SELECT pin,pin_identity FROM native_mail_pins WHERE workspace_id=$1 AND (message_action=$2 OR quote_action=$2 OR message_action=$3 OR quote_action=$3)',[binding.workspaceId,receipt.messageActionId,receipt.quoteActionId])).rows;
    for(const row of rows){const prior=row.pin as NativeMailPin;if(prior.messageRequest.idempotencyKey===receipt.messageActionId){if(!isDeepStrictEqual(prior,pin)||row.pin_identity!==receipt.pinDigest)throw new Refusal(409);const mail=await provisioner.enrollMail(pin);if(!isDeepStrictEqual(mail,pinEnrollmentReceipt(pin,'native-quote-email-enrollment-1')))throw new Refusal(503);return receipt;}if(prior.messageRequest.idempotencyKey===receipt.quoteActionId||prior.quoteRequest.idempotencyKey===receipt.messageActionId||prior.quoteRequest.idempotencyKey===receipt.quoteActionId&&!isDeepStrictEqual(prior.quoteRequest,pin.quoteRequest))throw new Refusal(409);}
    for(const prior of mailPins.values())if(prior.messageRequest.idempotencyKey===receipt.messageActionId&&!isDeepStrictEqual(prior,pin)||prior.messageRequest.idempotencyKey===receipt.quoteActionId||prior.quoteRequest.idempotencyKey===receipt.messageActionId||prior.quoteRequest.idempotencyKey===receipt.quoteActionId&&!isDeepStrictEqual(prior.quoteRequest,pin.quoteRequest))throw new Refusal(409);
    if(current.current.sourceVersion!==pin.quoteRequest.sourceVersion||current.current.distributorId!==pin.quoteRequest.body.distributorId||current.current.currency!==pin.quoteRequest.body.currency||current.current.subtotalMinor!==pin.quoteRequest.body.subtotalMinor)throw new Refusal(409);
    if((await c.query("SELECT 1 FROM native_pending_mail WHERE workspace_id=$1 AND quote_id=$2 AND state IS DISTINCT FROM 'resolved' LIMIT 1",[binding.workspaceId,binding.quoteId])).rowCount)throw new Refusal(409);
    const mail=await provisioner.enrollMail(pin);if(!isDeepStrictEqual(mail,pinEnrollmentReceipt(pin,'native-quote-email-enrollment-1')))throw new Refusal(503);
    await transaction(provisioner.pool,async p=>{await p.query('INSERT INTO native_mail_pins(workspace_id,quote_id,message_action,quote_action,pin_identity,pin) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[binding.workspaceId,binding.quoteId,receipt.messageActionId,receipt.quoteActionId,receipt.pinDigest,JSON.stringify(pin)]);});
    const read=(await provisioner.pool.query('SELECT pin,pin_identity FROM native_mail_pins WHERE workspace_id=$1 AND message_action=$2',[binding.workspaceId,receipt.messageActionId])).rows[0];if(!read||read.pin_identity!==receipt.pinDigest||!isDeepStrictEqual(read.pin,pin))throw new Refusal(503);return receipt;
   });reply(res,200,retained);return;
  }
  if(typeof req.headers.authorization!=='string'||!equal(req.headers.authorization,'Bearer '+binding.token))throw new Refusal(401);
  if(req.headers['x-looplabs-workspace']!==binding.workspaceId||req.headers['x-looplabs-binding']!==binding.quoteBinding)throw new Refusal(403);
  const path=req.url??'';const quotePath='/quotes/'+binding.quoteId;
  if(req.method==='GET'&&path===quotePath+'/policy'){
   if(!options.policy)throw new Refusal(503);
   const rows=await transaction(options.policy.pool,async c=>(await c.query('SELECT policy FROM native_quote_policies WHERE workspace_id=$1 AND quote_id=$2',[binding.workspaceId,binding.quoteId])).rows);
   if(rows.length!==1)throw new Refusal(503);const policy=rows[0].policy;
   if(!policy||typeof policy!=='object'||Array.isArray(policy)||Object.keys(policy).sort().join()!=='active,delegatedBps,hardCapBps,version'||!Number.isSafeInteger(policy.version)||policy.version<1||!Number.isSafeInteger(policy.delegatedBps)||!Number.isSafeInteger(policy.hardCapBps)||policy.delegatedBps<0||policy.delegatedBps>policy.hardCapBps||policy.hardCapBps>10000||typeof policy.active!=='boolean')throw new Refusal(503);
   reply(res,200,{contract:'quote-pricing-policy-1',workspaceId:binding.workspaceId,quoteId:binding.quoteId,binding:binding.quoteBinding,policy});return;
  }
  if(req.method==='GET'&&path===quotePath){const current=await transaction(pool,async c=>{const row=(await c.query('SELECT version,result FROM native_quotes WHERE workspace_id=$1 AND quote_id=$2 FOR SHARE',[binding.workspaceId,binding.quoteId])).rows[0];if(!row)throw new Refusal(404);return{workspaceId:binding.workspaceId,quoteId:binding.quoteId,sourceVersion:'v'+row.version,...row.result};});reply(res,200,{contract:'quote-versioned-read-1',binding:binding.quoteBinding,current});return;}
  const lookup=/^\/quote-effects\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(path);
  if(req.method==='GET'&&lookup){const observed=await transaction(pool,async c=>{const row=(await c.query('SELECT version,result FROM native_quotes WHERE workspace_id=$1 AND quote_id=$2 FOR SHARE',[binding.workspaceId,binding.quoteId])).rows[0];if(!row)throw new Refusal(404);const effects=(await c.query('SELECT effect FROM native_quote_effects WHERE workspace_id=$1 AND quote_id=$2 AND action_id=$3',[binding.workspaceId,binding.quoteId,lookup[1]])).rows.map(r=>r.effect);return{contract:'quote-effect-lookup-1',status:'available',effects,current:{workspaceId:binding.workspaceId,quoteId:binding.quoteId,sourceVersion:'v'+row.version,...row.result}};});reply(res,200,observed);return;}
  const mailPath=/^\/quote-mail\/([0-9a-f-]{36})$/i.exec(path);
  if(req.method==='GET'&&mailPath){
   const pin=await enrolledPin(mailPath[1]);if(!pin||!options.mail)throw new Refusal(403);
   const identity=nativeMailIdentity(pin.messageRequest)!;const predecessor=quoteRequestIdentity(pin.quoteRequest)!;
   const result=await transaction(pool,async c=>{
    const current=await quoteLookup(c,pin.quoteRequest.idempotencyKey,true);
    const row=(await c.query('SELECT request_identity,predecessor_identity,state,acceptance FROM native_pending_mail WHERE workspace_id=$1 AND quote_id=$2 AND action_id=$3',[binding.workspaceId,binding.quoteId,pin.messageRequest.idempotencyKey])).rows[0];
    const state=!row?'missing':row.state==='resolved'?'resolved':'pending';let observation:Observation=unavailable();
    if(row){
     if(row.request_identity!==identity||row.predecessor_identity!==predecessor)observation={outcome:'conflict',detail:'Retained mail identity differs from the offline pin.'};
     else if(state==='resolved'){
      const quote=observeQuoteEffect(pin.quoteRequest,current);
      if(quote.outcome!=='verified')observation=quote;
      else if(row.acceptance&&typeof row.acceptance==='object'&&!Array.isArray(row.acceptance)&&Object.keys(row.acceptance).sort().join(',')==='detail,outcome,reference'&&typeof row.acceptance.detail==='string'&&row.acceptance.detail.length<=1000&&row.acceptance.outcome==='verified'&&typeof row.acceptance.reference==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(row.acceptance.reference))observation={outcome:'verified',reference:row.acceptance.reference,detail:'Retained simulated email acceptance and current quote correlation match. This is not delivery evidence.'};
     }
    }
    return{contract:'native-quote-mail-fence-lookup-1',workspaceId:binding.workspaceId,quoteId:binding.quoteId,actionId:pin.messageRequest.idempotencyKey,binding:binding.emailBinding,requestIdentity:identity,quoteRequestIdentity:predecessor,state,observation};
   });reply(res,200,result);return;
  }
  const resolutionPath=/^\/quote-mail\/([0-9a-f-]{36})\/resolve$/i.exec(path);
  if(req.method==='POST'&&resolutionPath){
   const pin=await enrolledPin(resolutionPath[1]);if(!pin||!options.mail)throw new Refusal(403);
   const value=await body(req);if(!isDeepStrictEqual(value,pin.messageRequest)||req.headers['idempotency-key']!==pin.messageRequest.idempotencyKey)throw new Refusal(409);
   const identity=nativeMailIdentity(pin.messageRequest)!;const predecessor=quoteRequestIdentity(pin.quoteRequest)!;
   const envelope=(state:'pending'|'resolved',observation:Observation)=>({contract:'native-quote-mail-fence-resolution-1',workspaceId:binding.workspaceId,quoteId:binding.quoteId,actionId:pin.messageRequest.idempotencyKey,binding:binding.emailBinding,requestIdentity:identity,quoteRequestIdentity:predecessor,state,observation});
   const admission=await transaction(pool,async c=>{
    const current=await quoteLookup(c,pin.quoteRequest.idempotencyKey);
    const row=(await c.query('SELECT request_identity,predecessor_identity,state FROM native_pending_mail WHERE workspace_id=$1 AND quote_id=$2 AND action_id=$3',[binding.workspaceId,binding.quoteId,pin.messageRequest.idempotencyKey])).rows[0];
    if(!row)throw new Refusal(404);
    if(row.request_identity!==identity||row.predecessor_identity!==predecessor)throw new Refusal(409);
    if(!['pending','resolved'].includes(row.state))return{state:'pending' as const,observation:unavailable()};
    return{state:row.state as 'pending'|'resolved',observation:observeQuoteEffect(pin.quoteRequest,current)};
   });
   if(admission.observation.outcome!=='verified'){reply(res,200,envelope(admission.state,admission.observation));return;}
   // Recovery only reads the exact retained email effect. Never INSERT or send here.
   const adapter=new NativeQuoteEmailTransport(pin,{lookup:async action=>transaction(pool,c=>quoteLookup(c,action))},options.mail.transport);
   const observed=await adapter.inspect(pin.messageRequest);
   if(observed.outcome!=='verified'){reply(res,200,envelope(admission.state,observed));return;}
   const result=await transaction(pool,async c=>{
    const current=await quoteLookup(c,pin.quoteRequest.idempotencyKey);
    const row=(await c.query('SELECT request_identity,predecessor_identity,state,acceptance FROM native_pending_mail WHERE workspace_id=$1 AND quote_id=$2 AND action_id=$3',[binding.workspaceId,binding.quoteId,pin.messageRequest.idempotencyKey])).rows[0];
    if(!row||row.request_identity!==identity||row.predecessor_identity!==predecessor)throw new Refusal(409);
    const quote=observeQuoteEffect(pin.quoteRequest,current);if(quote.outcome!=='verified')return envelope(row.state==='resolved'?'resolved':'pending',quote);
    if(row.state==='resolved'){
     if(!isDeepStrictEqual(row.acceptance,observed))return envelope('resolved',{outcome:'conflict',detail:'Resolved acceptance differs from the independently observed email.'});
     return envelope('resolved',observed);
    }
    if(row.state!=='pending')return envelope('pending',unavailable());
    if(options.mail?.failResolutionActionIds?.has(pin.messageRequest.idempotencyKey))throw Error('Owned resolution persistence fault');
    const changed=await c.query("UPDATE native_pending_mail SET state='resolved',acceptance=$3::jsonb WHERE workspace_id=$1 AND quote_id=$2 AND action_id=$4 AND state='pending' AND request_identity=$5 AND predecessor_identity=$6",[binding.workspaceId,binding.quoteId,JSON.stringify(observed),pin.messageRequest.idempotencyKey,identity,predecessor]);if(changed.rowCount!==1)throw new Refusal(409);return envelope('resolved',observed);
   });reply(res,200,result);return;
  }
  if(req.method==='POST'&&mailPath){
   const pin=await enrolledPin(mailPath[1]);if(!pin||!options.mail)throw new Refusal(403);
   const value=await body(req);if(!isDeepStrictEqual(value,pin.messageRequest)||req.headers['idempotency-key']!==pin.messageRequest.idempotencyKey)throw new Refusal(409);
   const identity=nativeMailIdentity(pin.messageRequest)!;const predecessor=quoteRequestIdentity(pin.quoteRequest)!;
   const created=await transaction(pool,async c=>{
    const lookup=await quoteLookup(c,pin.quoteRequest.idempotencyKey);
    const prior=(await c.query('SELECT request_identity,predecessor_identity FROM native_pending_mail WHERE workspace_id=$1 AND action_id=$2',[binding.workspaceId,pin.messageRequest.idempotencyKey])).rows[0];
    if(prior){if(prior.request_identity!==identity||prior.predecessor_identity!==predecessor)throw new Refusal(409);return false;}
    if((await c.query("SELECT 1 FROM native_pending_mail WHERE workspace_id=$1 AND quote_id=$2 AND state IS DISTINCT FROM 'resolved' LIMIT 1",[binding.workspaceId,binding.quoteId])).rowCount)throw new Refusal(409);
    if(observeQuoteEffect(pin.quoteRequest,lookup).outcome!=='verified')throw new Refusal(409);
    await c.query("INSERT INTO native_pending_mail(workspace_id,quote_id,action_id,request_identity,predecessor_identity,state) VALUES($1,$2,$3,$4,$5,'pending')",[binding.workspaceId,binding.quoteId,pin.messageRequest.idempotencyKey,identity,predecessor]);return true;
   });
   const adapter=new NativeQuoteEmailTransport(pin,{lookup:async action=>transaction(pool,c=>quoteLookup(c,action))},options.mail.transport);
   // Only the transaction's actual creator sends. Every duplicate/restart inspects only.
   const observation=created?await adapter.write(pin.messageRequest):await adapter.inspect(pin.messageRequest);
   if(observation.outcome!=='verified'){reply(res,200,observation);return;}
   const resolved=await transaction(pool,async c=>{
    const current=await quoteLookup(c,pin.quoteRequest.idempotencyKey);if(observeQuoteEffect(pin.quoteRequest,current).outcome!=='verified')return false;
    if(options.mail?.failResolutionActionIds?.has(pin.messageRequest.idempotencyKey))throw Error('Owned resolution persistence fault');
    const result=await c.query("UPDATE native_pending_mail SET state='resolved',acceptance=$3::jsonb WHERE workspace_id=$1 AND action_id=$2 AND request_identity=$4 AND predecessor_identity=$5",[binding.workspaceId,pin.messageRequest.idempotencyKey,JSON.stringify(observation),identity,predecessor]);if(result.rowCount!==1)throw new Refusal(409);return true;
   });reply(res,200,resolved?observation:unavailable());return;
  }
  if(req.method!=='PATCH'||path!==quotePath)throw new Refusal(404);
  const value=await body(req);const identity=quoteRequestIdentity(value);if(!identity)throw new Refusal(400);const request=value as QuotePlan['update']['request'];
  if(request.workspaceId!==binding.workspaceId||request.resource!==quotePath||request.binding!==binding.quoteBinding)throw new Refusal(403);
  if(req.headers['idempotency-key']!==request.idempotencyKey)throw new Refusal(400);
  const effect=await transaction(pool,async c=>{
   const row=(await c.query('SELECT version,result FROM native_quotes WHERE workspace_id=$1 AND quote_id=$2 FOR UPDATE',[binding.workspaceId,binding.quoteId])).rows[0];if(!row)throw new Refusal(404);
   const prior=(await c.query('SELECT request_identity,effect FROM native_quote_effects WHERE workspace_id=$1 AND action_id=$2',[binding.workspaceId,request.idempotencyKey])).rows[0];
   if(prior){if(prior.request_identity!==identity)throw new Refusal(409);return prior.effect as QuoteEffect;}
   if((options.mail||(await c.query("SELECT to_regclass('native_pending_mail') present")).rows[0].present)&&(await c.query("SELECT 1 FROM native_pending_mail WHERE workspace_id=$1 AND quote_id=$2 AND state IS DISTINCT FROM 'resolved' LIMIT 1",[binding.workspaceId,binding.quoteId])).rowCount)throw new Refusal(409);
   if('v'+row.version!==request.sourceVersion)throw new Refusal(409);
   if(row.result.distributorId!==request.body.distributorId||row.result.currency!==request.body.currency||row.result.subtotalMinor!==request.body.subtotalMinor)throw new Refusal(409);
   const next=Number(row.version)+1;if(!Number.isSafeInteger(next))throw new Refusal(409);
   const committed:QuoteEffect={contract:'quote-effect-readback-1',binding:binding.quoteBinding,workspaceId:binding.workspaceId,quoteId:binding.quoteId,actionId:request.idempotencyKey,requestIdentity:identity,effectId:randomUUID(),state:'committed',sourceBefore:request.sourceVersion,sourceAfter:'v'+next,result:request.body};
   await c.query('UPDATE native_quotes SET version=$3,result=$4::jsonb WHERE workspace_id=$1 AND quote_id=$2',[binding.workspaceId,binding.quoteId,next,JSON.stringify(request.body)]);
   await c.query('INSERT INTO native_quote_effects(workspace_id,quote_id,action_id,request_identity,effect) VALUES($1,$2,$3,$4,$5::jsonb)',[binding.workspaceId,binding.quoteId,request.idempotencyKey,identity,JSON.stringify(committed)]);
   return committed;
  });
  // Controlled lost response after real COMMIT; lookup is the recovery mechanism.
  if(options.loseReplyActionIds?.has(request.idempotencyKey)&&!lost.has(request.idempotencyKey)){lost.add(request.idempotencyKey);res.destroy();return;}
  reply(res,200,effect);
 }catch(e){if(!res.destroyed)reply(res,e instanceof Refusal?e.status:503,{status:'unavailable'});}});
 server.requestTimeout=5000;server.headersTimeout=5000;server.maxRequestsPerSocket=32;
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(target.port,target.bind,resolve);});const address=server.address();if(!address||typeof address==='string')throw Error('Owned listener unavailable');
 return{origin:protocol+'://'+target.hostname+':'+address.port,close:()=>new Promise<void>((resolve,reject)=>{server.close(e=>e?reject(e):resolve());server.closeIdleConnections();})};
}

/** Exact isolated network fixture extension. The default listener stays loopback.
 * A generic hostname/bind address cannot widen the fixture or production target. */
export function nativeQuoteListenerTarget(container:NativeQuoteOptions['ownedContainer'],port?:number){
 if(container===undefined)return {hostname:'127.0.0.1',bind:'127.0.0.1',port:port??0};
 if(!container||Object.keys(container).sort().join()!=='hostname,kind,port'||container.kind!=='owned-disposable-docker'||container.hostname!=='quote-twin.looplabs.test'||container.port!==9443||port!==undefined||!existsSync('/.dockerenv'))throw Error('Exact owned disposable native listener required');
 return {hostname:'quote-twin.looplabs.test',bind:'0.0.0.0',port:9443};
}
