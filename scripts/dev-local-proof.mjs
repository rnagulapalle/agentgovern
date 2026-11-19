// Real local PostgreSQL/TLS and Next HTTP acceptance. No external provider effects.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createServer} from 'node:net';
import {Pool} from 'pg';

const origin='http://localhost:3007';
const probe=createServer();await new Promise((yes,no)=>{probe.once('error',no);probe.listen(3007,'127.0.0.1',yes);});await new Promise(yes=>probe.close(yes));
const cli=mode=>execFileSync(process.execPath,['--import','tsx','scripts/dev-local.mjs',mode],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000});
let child,log='',database=false;
try{
 cli('setup');database=true;
 const initial=await readFile('.local/development/accounts.json');
 cli('setup');assert.deepEqual(await readFile('.local/development/accounts.json'),initial,'Rerun changed test accounts');
 const state=JSON.parse(await readFile('.local/development/state.json','utf8'));
 const publication=JSON.parse(await readFile(state.webFile,'utf8'));
 const plaintext=new Pool({connectionString:publication.web[0].url,ssl:false,connectionTimeoutMillis:5000});
 try{await assert.rejects(plaintext.query('SELECT 1'));}finally{await plaintext.end();}
 const accounts=JSON.parse(initial);assert.equal(accounts.length,2);assert.notEqual(accounts[0].email,accounts[1].email);
 child=spawn(process.execPath,['--import','tsx','scripts/dev-local.mjs','start'],{detached:true,stdio:['ignore','pipe','pipe']});
 for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{log=(log+b).slice(-32000);});
 child.on('error',()=>{});
 let loaded=false;
 for(let i=0;i<120;i++){
  assert(child.exitCode===null,'Developer server exited before acceptance');
  try{const r=await fetch(origin+'/api/workspace/session',{signal:AbortSignal.timeout(2000)});if(r.status===401){loaded=true;break;}}catch{}
  await new Promise(yes=>setTimeout(yes,500));
 }
 assert(loaded,'Developer workspace did not become available');
 const post=(account,extra={})=>fetch(origin+'/api/workspace/session',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...extra},body:JSON.stringify({email:account.email,password:account.password}),signal:AbortSignal.timeout(20000)});
 assert.equal((await post({...accounts[0],password:'incorrect-password'})).status,401);
 assert.equal((await post(accounts[0],{Origin:'https://unrelated.example'})).status,403);
 const sessions=[];
 for(const account of accounts){
  const login=await post(account);assert.equal(login.status,200,'Local test member login failed');
  const cookie=login.headers.get('set-cookie')?.split(';')[0];assert(cookie);sessions.push(cookie);
  const who=await fetch(origin+'/api/workspace/session',{headers:{Cookie:cookie}});assert.equal(who.status,200);assert.equal((await who.json()).email,account.email);
  for(const route of ['/api/workspace/agents','/api/workspace/records']){
   const r=await fetch(origin+route,{headers:{Cookie:cookie}});assert.equal(r.status,200,route+' failed');await r.json();
  }
  const page=await fetch(origin+'/control-plane/agents',{headers:{Cookie:cookie},signal:AbortSignal.timeout(30000)});assert.equal(page.status,200);assert((await page.text()).includes('LoopLabs'));
 }
 assert.notEqual(sessions[0],sessions[1]);
 assert.equal((await fetch(origin+'/api/workspace/agents')).status,401);
 await writeFile('.local/development/acceptance.json',JSON.stringify({version:1,checkedUtc:new Date().toISOString(),platform:process.platform,node:process.version,accountBytesSha256:createHash('sha256').update(initial).digest('hex'),checks:['tenant setup','repeat setup preserves accounts','plaintext database connection refused','Next startup','two independent named logins','wrong password refused','hostile Origin refused','anonymous API refused','authenticated agent/record APIs','private agents page'],providerEffectsTested:false,productionChanged:false},null,2)+'\n',{mode:0o600});
 console.log('Developer setup acceptance passed: TLS tenant setup, repeat setup, two HTTP logins, refusal cases, private APIs and agents page. No provider effects tested.');
}catch(e){
 await writeFile('.local/development/acceptance-failure.log',log,{mode:0o600}).catch(()=>{});throw e;
}finally{
 if(child&&child.exitCode===null){process.kill(-child.pid,'SIGTERM');await new Promise(yes=>{child.once('exit',yes);setTimeout(yes,5000).unref();});}
 if(database)cli('stop');
}
