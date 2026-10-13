/** Offline recovery capture format. These structural budgets are not execution
 * authority; catalog, exact OIDs, source grants and external epochs remain required. */
import {readOwnedPrivateFile} from './owned-private-file';
export const recoveryCaptureBudget=Object.freeze({legacyBytes:131072,bytes:1048576,tenants:20,roles:102,functions:128,capabilities:8192,supplemental:40,jsonDepth:16,jsonKeys:65536});
export type RoleIdentity={name:string;oid:string;login:boolean;bypass:boolean};
export type Capability={kind:'schema'|'table'|'column'|'function';name:string;column:string;grantee:string;privilege:string;grantable:boolean};
export type SupplementalQuote={file:string;sha256:string;readySha256:string;role:string;oid:string;org:string;purpose:'worker'|'scheduler';epoch:string};
export type RecoveryIdentity={version:1|2|3;contract?:'tenant-recovery-capture-3';tenants?:{org:string;epoch:string}[];supplemental?:SupplementalQuote[];installation:string;schema:string;database:string;databaseOid:string;schemaOid:string;owner:string;webSha256:string;workloadsSha256:string;roles:RoleIdentity[];functions:{name:string;definition:string;owner:string}[];capabilities:Capability[]};
const refuse=()=>new Error('Bounded recovery capture unavailable.');
const digest=/^[a-f0-9]{64}$/,oid=/^[1-9][0-9]{0,9}$/,identifier=/^[a-z][a-z0-9_]{0,62}$/,epoch=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function record(value:unknown,keys:readonly string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw refuse();const descriptors=Object.getOwnPropertyDescriptors(value);if(Reflect.ownKeys(descriptors).some(k=>typeof k!=='string')||Object.keys(descriptors).sort().join()!==[...keys].sort().join()||Object.values(descriptors).some(d=>!Object.hasOwn(d,'value')||!d.enumerable))throw refuse();return value as Record<string,unknown>;}
function rows(value:unknown,max:number):unknown[]{if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>max||Reflect.ownKeys(value).length!==value.length+1)throw refuse();for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||!Object.hasOwn(d,'value')||!d.enumerable)throw refuse();}return value;}
function text(value:unknown,max:number,empty=false):string{if(typeof value!=='string'||(!empty&&!value.length)||value.length>max||/[\x00-\x1f\x7f]/.test(value))throw refuse();return value;}
function match(value:unknown,regex:RegExp):string{const s=text(value,1024);if(!regex.test(s))throw refuse();return s;}
function boolean(value:unknown):boolean{if(typeof value!=='boolean')throw refuse();return value;}
function unique(values:readonly string[]){if(new Set(values).size!==values.length)throw refuse();}
const baseKeys=['version','installation','schema','database','databaseOid','schemaOid','owner','webSha256','workloadsSha256','roles','functions','capabilities'];
/** Normalize property order to the existing catalog SQL object shape; array order
 * stays exact. No caller getter/toJSON is invoked by validation or serialization. */
export function validateRecoveryCapture(value:unknown):RecoveryIdentity{
 const first=record(value,Object.keys(value&&typeof value==='object'?value:{}));const version=first.version;if(![1,2,3].includes(version as number))throw refuse();
 const keys=[...baseKeys,...(version===3?['contract','tenants']:[]),...(version===2||version===3&&Object.hasOwn(first,'supplemental')?['supplemental']:[])];const m=record(value,keys);
 const installation=match(m.installation,/^[a-z][a-z0-9_]{0,19}$/),schema=match(m.schema,identifier),database=match(m.database,identifier),databaseOid=match(m.databaseOid,oid),schemaOid=match(m.schemaOid,oid),owner=match(m.owner,identifier),webSha256=match(m.webSha256,digest),workloadsSha256=match(m.workloadsSha256,digest);
 const roles=rows(m.roles,recoveryCaptureBudget.roles).map(v=>{const r=record(v,['name','oid','login','bypass']);return{name:match(r.name,identifier),oid:match(r.oid,oid),login:boolean(r.login),bypass:boolean(r.bypass)};});if(!roles.length)throw refuse();unique(roles.map(r=>r.name));unique(roles.map(r=>r.oid));
 const functions=rows(m.functions,recoveryCaptureBudget.functions).map(v=>{const f=record(v,['name','definition','owner']);return{name:text(f.name,512),definition:match(f.definition,digest),owner:match(f.owner,identifier)};});if(!functions.length)throw refuse();unique(functions.map(f=>f.name));
 const roleNames=new Set([...roles.map(r=>r.name),'PUBLIC']),functionNames=new Set(functions.map(f=>f.name));
 const capabilities=rows(m.capabilities,recoveryCaptureBudget.capabilities).map(v=>{const c=record(v,['kind','name','column','grantee','privilege','grantable']);const kind=c.kind;if(!['schema','table','column','function'].includes(kind as string))throw refuse();const name=kind==='function'?text(c.name,512):match(c.name,identifier),column=text(c.column,63,true),grantee=text(c.grantee,63),privilege=text(c.privilege,16),grantable=boolean(c.grantable);if(!roleNames.has(grantee)||!['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','USAGE','CREATE','EXECUTE','MAINTAIN'].includes(privilege)||kind==='function'&&!functionNames.has(name)||kind==='schema'&&name!==schema||kind==='column'&&!identifier.test(column)||kind!=='column'&&column!=='')throw refuse();return{kind:kind as Capability['kind'],name,column,grantee,privilege,grantable};});if(!capabilities.length)throw refuse();unique(capabilities.map(c=>JSON.stringify([c.kind,c.name,c.column,c.grantee,c.privilege])));
 let supplemental:SupplementalQuote[]|undefined;if(Object.hasOwn(m,'supplemental')){supplemental=rows(m.supplemental,recoveryCaptureBudget.supplemental).map(v=>{const e=record(v,['file','sha256','readySha256','role','oid','org','purpose','epoch']);const file=text(e.file,4096);if(!file.startsWith('/')||file.includes('\\')||file.split('/').slice(1).some(p=>!p||p==='.'||p==='..'))throw refuse();const role=match(e.role,/^llqt_[a-z0-9_]{1,54}$/),purpose=e.purpose;if(!['worker','scheduler'].includes(purpose as string))throw refuse();return{file,sha256:match(e.sha256,digest),readySha256:match(e.readySha256,digest),role,org:match(e.org,/^[-_a-zA-Z0-9]{1,64}$/),purpose:purpose as 'worker'|'scheduler',epoch:match(e.epoch,epoch),oid:match(e.oid,oid)};});if(!supplemental.length)throw refuse();unique(supplemental.map(e=>e.role));unique(supplemental.map(e=>e.org+':'+e.purpose));for(const e of supplemental)if(!roles.some(r=>r.name===e.role&&r.oid===e.oid))throw refuse();}
 let tenants:{org:string;epoch:string}[]|undefined;if(version===3){if(m.contract!=='tenant-recovery-capture-3')throw refuse();tenants=rows(m.tenants,recoveryCaptureBudget.tenants).map(v=>{const t=record(v,['org','epoch']);return{org:match(t.org,/^[-_a-zA-Z0-9]{1,64}$/),epoch:match(t.epoch,epoch)};});if(!tenants.length)throw refuse();unique(tenants.map(t=>t.org));for(const e of supplemental??[])if(!tenants.some(t=>t.org===e.org&&t.epoch===e.epoch))throw refuse();}
 return{version:version as 1|2|3,...(version===3?{contract:'tenant-recovery-capture-3' as const,tenants}:{}),...(supplemental?{supplemental}:{}),installation,schema,database,databaseOid,schemaOid,owner,webSha256,workloadsSha256,roles,functions,capabilities};
}
/** JSON.parse establishes syntax first; this bounded lexical pass rejects duplicate
 * decoded object keys in every format without imposing v3 formatting on archives. */
function refuseDuplicateJsonKeys(json:string){
 const stack:{object:boolean;key:boolean;keys:Set<string>}[]=[];let keyCount=0;
 for(let i=0;i<json.length;i++){
  const char=json[i];
  if(char==='"'){
   const start=i;for(i++;i<json.length;i++){if(json[i]==='\\'){i++;continue;}if(json[i]==='"')break;}
   const current=stack.at(-1);if(current?.object&&current.key){const key=JSON.parse(json.slice(start,i+1)) as string;if(++keyCount>recoveryCaptureBudget.jsonKeys||current.keys.has(key))throw refuse();current.keys.add(key);current.key=false;}
  }else if(char==='{'||char==='['){if(stack.length>=recoveryCaptureBudget.jsonDepth)throw refuse();stack.push({object:char==='{',key:char==='{',keys:new Set()});}
  else if(char==='}'||char===']')stack.pop();
  else if(char===','){const current=stack.at(-1);if(current?.object)current.key=true;}
 }
}
export function parseRecoveryCapture(bytes:Buffer):RecoveryIdentity{if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>recoveryCaptureBudget.bytes)throw refuse();let value:unknown;let json:string;try{json=new TextDecoder('utf-8',{fatal:true}).decode(bytes);value=JSON.parse(json);refuseDuplicateJsonKeys(json);}catch{throw refuse();}const identity=validateRecoveryCapture(value);if(identity.version===3&&json.trim()!==JSON.stringify(value))throw refuse();if(identity.version!==3&&bytes.length>recoveryCaptureBudget.legacyBytes)throw refuse();return identity;}
export function encodeRecoveryCapture(identity:RecoveryIdentity):Buffer{const validated=validateRecoveryCapture(identity),bytes=Buffer.from(JSON.stringify(validated));parseRecoveryCapture(bytes);return bytes;}
export async function readRecoveryCapture(file:string){const loaded=await readOwnedPrivateFile(file,recoveryCaptureBudget.bytes);return{...loaded,identity:parseRecoveryCapture(loaded.bytes)};}
