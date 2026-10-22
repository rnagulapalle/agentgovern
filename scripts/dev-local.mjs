// Local developer launcher only. Never used by Next instrumentation or deployment.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,lstat,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:net';
import {parseEnv} from 'node:util';
import {Pool} from 'pg';
import {bootstrapInstalledAssemblyDatabase} from './staging-installed-database-bootstrap.ts';
import {bootstrapTenantContext} from '../lib/workspace/tenant-bootstrap.ts';
import {readOwnedPrivateFile} from '../lib/workspace/owned-private-file.ts';
import {scopedPoolOptions} from '../lib/durable/pg-transport.ts';

export function validateDeveloperLocation(path,platform=process.platform,uid=process.getuid?.()){
 assert(['linux','darwin'].includes(platform),'Use Ubuntu/WSL2 or macOS, not native Windows.');
 assert(Number.isInteger(uid)&&uid>0,'Run as your regular user, not root or sudo.');
 assert(resolve(path)===path&&!/[\r\n\0]/.test(path),'Use a canonical local checkout path.');
 assert(!/^\/mnt\/[a-z](\/|$)/i.test(path),'Keep the checkout in Ubuntu /home, not a Windows-mounted drive.');
}
export function validateDeveloperState(value,root){
 assert(value&&Object.keys(value).sort().join()==='accountsFile,port,version,webFile');
 assert(value.version===1&&Number.isInteger(value.port)&&value.port>1024&&value.port<65536);
 assert(value.accountsFile===join(root,'accounts.json'));
 assert(value.webFile===join(root,'installation','tenant-generation','web.json'));
 return value;
}
async function privateDirectory(path){
 try{await mkdir(path,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
 const s=await lstat(path);assert(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===process.getuid()&&(s.mode&0o7777)===0o700,'Private directory must be owned by you with mode 700.');
 assert.equal(await realpath(path),path,'Symlinked private directory refused.');
}
const command=(file,args)=>execFileSync(file,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000}).trim();
function postgresBinaries(){
 let bin;try{bin=command('pg_config',['--bindir']);}catch{throw Error('Install PostgreSQL server tools (initdb, pg_ctl and pg_config), then retry.');}
 for(const name of ['initdb','pg_ctl'])command(join(bin,name),['--version']);
 return bin;
}
async function exists(path){try{await lstat(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
const pgLiteral=value=>"'"+value.replaceAll('\\','\\\\').replaceAll("'","''")+"'";
async function freePort(){const s=createServer();await new Promise((yes,no)=>{s.once('error',no);s.listen(0,'127.0.0.1',yes);});const p=s.address().port;await new Promise((yes,no)=>s.close(e=>e?no(e):yes()));return p;}
async function startDatabase(root,bin){
 const data=join(root,'postgres');
 try{command(join(bin,'pg_ctl'),['-D',data,'status']);}
 catch{command(join(bin,'pg_ctl'),['-D',data,'-l',join(root,'postgres.log'),'-w','start']);}
}
async function readState(root){const read=await readOwnedPrivateFile(join(root,'state.json'),16384);const s=validateDeveloperState(JSON.parse(read.bytes.toString('utf8')),root);await read.assertStable();return s;}

export async function setupDeveloper(root){
 validateDeveloperLocation(root);const bin=postgresBinaries();command('openssl',['version']);
 await privateDirectory(root);
 if(await exists(join(root,'state.json'))){
  const state=await readState(root);await startDatabase(root,bin);
  const installed=await bootstrapTenantContext(state.webFile);await installed.close();
  console.log('Existing local tenant installation verified; accounts preserved.');return state;
 }
 assert(!await exists(join(root,'install-intent.json')),'Previous setup did not finish. Private files were preserved; investigate before moving this directory aside.');
 await writeFile(join(root,'install-intent.json'),JSON.stringify({version:1,purpose:'local-developer-only'}),{mode:0o600,flag:'wx'});
 const ca=join(root,'ca'),tls=join(root,'tls'),socket=join(root,'socket');
 for(const dir of [ca,tls,socket])await privateDirectory(dir);
 const password=randomBytes(32).toString('base64url'),passwordFile=join(root,'owner-password');
 await writeFile(passwordFile,password,{mode:0o600,flag:'wx'});
 const ssl=(...args)=>command('openssl',args);
 ssl('req','-x509','-newkey','rsa:2048','-nodes','-days','30','-subj','/CN=LoopLabs local developer CA','-addext','basicConstraints=critical,CA:TRUE','-keyout',join(tls,'ca.key'),'-out',join(ca,'ca.pem'));
 ssl('req','-newkey','rsa:2048','-nodes','-subj','/CN=localhost','-keyout',join(tls,'server.key'),'-out',join(tls,'server.csr'));
 await writeFile(join(tls,'extensions'),'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1\nextendedKeyUsage=serverAuth\n',{mode:0o600,flag:'wx'});
 ssl('x509','-req','-in',join(tls,'server.csr'),'-CA',join(ca,'ca.pem'),'-CAkey',join(tls,'ca.key'),'-CAcreateserial','-days','30','-extfile',join(tls,'extensions'),'-out',join(tls,'server.pem'));
 const {chmod}=await import('node:fs/promises');
 for(const f of [join(ca,'ca.pem'),join(tls,'ca.key'),join(tls,'server.key'),join(tls,'server.pem')])await chmod(f,0o600);
 const data=join(root,'postgres'),port=await freePort();
 command(join(bin,'initdb'),['-D',data,'--username=looplabs_dev_owner','--pwfile='+passwordFile,'--auth-local=scram-sha-256','--auth-host=scram-sha-256','--encoding=UTF8','--no-locale']);
 const config=await readFile(join(data,'postgresql.conf'),'utf8');
 await writeFile(join(data,'postgresql.conf'),config+`\nlisten_addresses = 'localhost'\nport = ${port}\nunix_socket_directories = ${pgLiteral(socket)}\nssl = on\nssl_cert_file = ${pgLiteral(join(tls,'server.pem'))}\nssl_key_file = ${pgLiteral(join(tls,'server.key'))}\n`,{mode:0o600});
 await writeFile(join(data,'pg_hba.conf'),'local all all scram-sha-256\nhostssl all all 127.0.0.1/32 scram-sha-256\nhostssl all all ::1/128 scram-sha-256\nhostnossl all all 127.0.0.1/32 reject\nhostnossl all all ::1/128 reject\n',{mode:0o600});
 await startDatabase(root,bin);
 const transport={mode:'verified-tls',trust:'owned-ca',caFile:join(ca,'ca.pem'),caSha256:createHash('sha256').update(await readFile(join(ca,'ca.pem'))).digest('hex')};
 const url=`postgresql://looplabs_dev_owner:${password}@localhost:${port}/`;
 const admin=new Pool(await scopedPoolOptions({url:url+'postgres',schema:'public',purpose:'installer',transport}));
 try{await admin.query('CREATE DATABASE looplabs_development');}finally{await admin.end();}
 const installation=join(root,'installation');await privateDirectory(installation);
 const installed=await bootstrapInstalledAssemblyDatabase({url:url+'looplabs_development',transport,directory:installation});
 try{
  // Persist only local synthetic login credentials, never sessions or provider credentials.
  const accountsFile=join(root,'accounts.json');await writeFile(accountsFile,JSON.stringify(installed.accounts,null,2)+'\n',{mode:0o600,flag:'wx'});
  const check=await bootstrapTenantContext(installed.webFile);await check.close();
  const state={version:1,port,webFile:installed.webFile,accountsFile};
  validateDeveloperState(state,root);
  await writeFile(join(root,'state.json'),JSON.stringify(state,null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log('Local tenant installation verified. Two synthetic test accounts are in .local/development/accounts.json.');
  return state;
 }finally{await installed.disconnect();}
}

export function developerEnvironment(inherited,localFile,state){
 const env={...inherited};const old=parseEnv(localFile);
 // Next loads .env.local itself. Explicit empty overrides prevent accidentally
 // selecting a real provider, planner, workload or production recovery fence.
 for(const key of new Set([...Object.keys(env),...Object.keys(old)]))if(/^(LOOPLABS_|AWS_|PG)/.test(key))env[key]='';
 for(const key of ['LOOPLABS_WORKSPACE_ID','LOOPLABS_RECOVERY_EPOCH','LOOPLABS_DEPLOYMENT_PROFILE'])delete env[key];
 env.NODE_ENV='development';
 env.LOOPLABS_TENANT_WEB_CONFIG=state.webFile;
 // Existing local HTTP behavior derives the origin from the direct loopback
 // request. Do not add a production-origin exception for developer setup.
 env.LOOPLABS_DURABLE_ORIGIN='';
 // Preserve only the existing loopback twin; hosted bindings stay disabled.
 const twin=old.LOOPLABS_CONNECTOR_TWIN_URL??inherited.LOOPLABS_CONNECTOR_TWIN_URL;
 if(twin){const u=new URL(twin);assert(['localhost','127.0.0.1'].includes(u.hostname)&&u.protocol==='http:'&&!u.username&&!u.password&&!u.search&&!u.hash,'Developer twin must be local.');env.LOOPLABS_CONNECTOR_TWIN_URL=twin;env.LOOPLABS_CONNECTOR_TWIN_TOKEN=old.LOOPLABS_CONNECTOR_TWIN_TOKEN??inherited.LOOPLABS_CONNECTOR_TWIN_TOKEN??'';}
 // Empty workspace/epoch values are not equivalent to absent; prevent Next
 // from loading an old pair by refusing such local-file configuration outright.
 assert(!old.LOOPLABS_WORKSPACE_ID&&!old.LOOPLABS_RECOVERY_EPOCH,'Remove old workspace/recovery overrides from .env.local for dev:local.');
 assert(!Object.hasOwn(old,'LOOPLABS_DEPLOYMENT_PROFILE')&&!Object.hasOwn(inherited,'LOOPLABS_DEPLOYMENT_PROFILE'),'Unset deployment profiles for the separate local developer installation.');
 return env;
}
export async function runDeveloper(mode){
 const cwd=await realpath(process.cwd());validateDeveloperLocation(cwd);
 const local=join(cwd,'.local');await privateDirectory(local);const root=join(local,'development');
 if(mode==='setup')return setupDeveloper(root);
 assert(['start','stop'].includes(mode),'Use pnpm dev:setup, pnpm dev:local or pnpm dev:stop.');
 const state=await readState(root),bin=postgresBinaries();
 if(mode==='stop'){command(join(bin,'pg_ctl'),['-D',join(root,'postgres'),'-m','fast','-w','stop']);console.log('Local developer database stopped; data retained.');return;}
 await startDatabase(root,bin);
 const installed=await bootstrapTenantContext(state.webFile);await installed.close();
 const text=await exists(join(cwd,'.env.local'))?await readFile(join(cwd,'.env.local'),'utf8'):'';
 const env=developerEnvironment(process.env,text,state);
 const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','-p','3007'],{stdio:'inherit',env});
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill(signal));
 const result=await new Promise((yes,no)=>{child.once('error',no);child.once('exit',(code)=>yes(code??1));});process.exitCode=result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 process.umask(0o077);
 try{await runDeveloper(process.argv[2]);}
 catch(error){console.error('Local setup/start refused: '+(error.code==='ENOENT'?'Required private installation or PostgreSQL executable missing. Run pnpm dev:setup after installing prerequisites.':error.name==='AssertionError'?error.message:'Check .local/development/postgres.log and private installation files. No runtime checks were bypassed.'));process.exitCode=1;}
}
