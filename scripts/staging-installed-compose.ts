/** Compose construction from the source-owned base stack and sealed attachments.
 * No merge overlay: env_file arrays are replaced so scheduler never inherits
 * worker credentials. Host admission still runs on all thirteen bounded roles. */
import assert from 'node:assert/strict';
import {persistentDatabaseService} from './persistent-installed-database.mjs';
import {dirname,resolve} from 'node:path';
type Service=Record<string,unknown>;type Stack={services:Record<string,Service>;[key:string]:unknown};
const baseNames=['web','application-db','temporal-db','temporal','authorization','temporal-worker','temporal-scheduler','connector-twin'];
const bind=(path:string,readonly=true)=>({type:'bind',source:path,target:path,read_only:readonly});
function path(p:string){assert(typeof p==='string'&&resolve(p)===p&&!/[\r\n\0]/.test(p));return p;}
function attachment(p:Service,env:string){assert(typeof p.user==='string'&&/^[1-9][0-9]*:[1-9][0-9]*$/.test(p.user));assert(Array.isArray(p.volumes)&&p.volumes.length>=2);for(const v of p.volumes){const m=v as ReturnType<typeof bind>;assert(m.type==='bind'&&m.source===m.target&&m.read_only===true);path(m.source);}return {...p,env_file:[path(env)]};}
export function installedAssemblyDatabaseService(base:Service,input:{data:string;tls:string;passwd:string;uid:number;gid:number}){assert(input.uid>0&&input.gid>0&&Number.isSafeInteger(input.uid)&&Number.isSafeInteger(input.gid));const user=`${input.uid}:${input.gid}`;
 return {...base,user,env_file:[],cap_add:[],read_only:true,tmpfs:['/tmp'],entrypoint:['sh','-c'],command:["initdb -D /owned-pg -U trial -A scram-sha-256 --pwfile=/owned-tls/password >/tmp/init.log && printf 'local all all trust\\nhostnossl all all all reject\\nhostssl all all all scram-sha-256\\n' > /owned-pg/pg_hba.conf && postgres -D /owned-pg -c unix_socket_directories=/tmp -c listen_addresses=* -c ssl=on -c ssl_cert_file=/owned-tls/server.pem -c ssl_key_file=/owned-tls/server.key"],volumes:[{type:'bind',source:path(input.data),target:'/owned-pg',read_only:false},{type:'bind',source:path(input.tls),target:'/owned-tls',read_only:true},{type:'bind',source:path(input.passwd),target:'/etc/passwd',read_only:true}],networks:{application:{aliases:['trial-db']}},healthcheck:{test:['CMD','pg_isready','-h','/tmp','-U','trial','-d','postgres'],interval:'5s',timeout:'3s',retries:12}};
}
export function installedAssemblyCompose(input:{databaseLifecycle?:'disposable'|'persistent';base:Stack;baseAttachment:Stack;quoteAttachment:Stack;root:string;databaseTls:string;databaseData:string;databasePasswd:string;databaseCa:string;uid:number;gid:number;images:{quote:string;provisioner:string;quoteEmail:string};quote:{webExecutionFile:string;backgroundFile:string;provider:{listenerFile:string;provisionerFile:string;nativeCa:string;emailCa:string;nativeTls:string;emailTls:string;emailState:string}}}){
 assert(input.databaseLifecycle===undefined||['disposable','persistent'].includes(input.databaseLifecycle),'Explicit supported database lifecycle required');
 assert.deepEqual(Object.keys(input.base.services).sort(),baseNames.toSorted());assert.deepEqual(Object.keys(input.baseAttachment.services).sort(),['web','temporal-worker','temporal-scheduler'].sort());assert.deepEqual(Object.keys(input.quoteAttachment.services).sort(),['quote-worker','quote-scheduler'].sort());
 assert(input.uid>0&&input.gid>0&&Number.isSafeInteger(input.uid)&&Number.isSafeInteger(input.gid));const user=`${input.uid}:${input.gid}`,root=path(input.root);
 for(const image of Object.values(input.images))assert(/^sha256:[a-f0-9]{64}$/.test(image));
 const result=structuredClone(input.base),s=result.services;
 // Private generated credentials remain owner-only; runtime readers use that prepared identity.
 for(const name of ['authorization','temporal'])s[name]={...s[name],user};
 // Go's static process-owner detector needs username metadata; numeric UID remains execution identity.
 const temporalEnvironment=s.temporal.environment;assert(temporalEnvironment===undefined||(temporalEnvironment!==null&&typeof temporalEnvironment==='object'&&!Array.isArray(temporalEnvironment)&&Object.getPrototypeOf(temporalEnvironment)===Object.prototype),'Temporal environment must be a mapping');
 s.temporal.environment={...(temporalEnvironment??{}),USER:'looplabs-runtime'};
 for(const [name,env]of [['web','web'],['temporal-worker','worker'],['temporal-scheduler','scheduler']])s[name]={...s[name],...attachment(input.baseAttachment.services[name],root+'/attached/'+env+'.env')};
 const temporalMounts=(input.base.services['temporal-worker'].volumes as Array<Record<string,unknown>>).filter(v=>v.target==='/run/temporal-tls');assert.equal(temporalMounts.length,1);for(const name of ['temporal-worker','temporal-scheduler'])s[name].volumes=[...(s[name].volumes as unknown[]),...temporalMounts];
 const provider=input.quote.provider;const webPaths=[dirname(path(input.quote.webExecutionFile)),dirname(path(input.quote.backgroundFile)),dirname(path(provider.provisionerFile)),dirname(path(provider.nativeCa)),dirname(path(provider.emailCa))];assert.equal(new Set(webPaths).size,5);
 s.web.volumes=[...(s.web.volumes as unknown[]),...webPaths.map(p=>bind(p))];s.web.environment={...(s.web.environment??{}),LOOPLABS_QUOTE_DEMO_CONFIG:input.quote.webExecutionFile,LOOPLABS_QUOTE_BACKGROUND_CONFIG:input.quote.backgroundFile};
 for(const name of ['quote-worker','quote-scheduler']){const p=input.quoteAttachment.services[name];assert(Array.isArray(p.env_file)&&p.env_file.length===1&&typeof p.env_file[0]==='string');s[name]={...input.base.services[name==='quote-worker'?'temporal-worker':'temporal-scheduler'],...attachment(p,p.env_file[0]),image:input.images.quote,environment:{LOOPLABS_TEMPORAL_HEALTH_PORT:name==='quote-worker'?'9320':'9321'},volumes:[...(p.volumes as unknown[]),...temporalMounts]};}
 s['application-db']=installedAssemblyDatabaseService(s['application-db'],{data:input.databaseData,tls:input.databaseTls,passwd:input.databasePasswd,uid:input.uid,gid:input.gid});
 if(input.databaseLifecycle==='persistent')s['application-db']=persistentDatabaseService(s['application-db']);
 const hardening={user,read_only:true,tmpfs:['/tmp'],cap_drop:['ALL'],security_opt:['no-new-privileges:true'],pids_limit:256,restart:'no',mem_limit:512*1024**2,cpus:0.5,networks:['application']};
 s['quote-twin']={...hardening,image:input.images.provisioner,entrypoint:['node','--import','tsx','scripts/staging-native-quote-provider-process.mjs'],command:[provider.listenerFile],volumes:[dirname(path(provider.listenerFile)),dirname(path(provider.nativeTls)),dirname(path(input.databaseCa)),dirname(path(provider.emailCa))].map(p=>bind(p)),networks:{application:{aliases:['quote-twin.looplabs.test']}}};
 s['quote-email']={...hardening,image:input.images.quoteEmail,entrypoint:['python','scripts/connector-twin-tls.py'],command:['--owned-container-quote-email','--tls-generation',provider.emailTls],environment:{LOOPLABS_CONNECTOR_STATE_DIR:provider.emailState,LOOPLABS_TWIN_CONTAINER:'1'},volumes:[bind(dirname(path(provider.emailTls))),bind(path(provider.emailState),false)],networks:{application:{aliases:['quote-email.looplabs.test']}},healthcheck:{test:['CMD','python','scripts/check-quote-email-health.py','--container',provider.emailTls],interval:'5s',timeout:'4s',retries:12}};
 s['offline-installer']={...hardening,image:input.images.provisioner,entrypoint:['node','--import','tsx','scripts/staging-installed-platform-lifecycle.mjs'],environment:{LOOPLABS_INSTALLED_ASSEMBLY_DIRECTORY:root,LOOPLABS_STAGING_PLATFORM_PROOF:'isolated'},volumes:[bind(root,false)]};
 assert.equal(Object.keys(s).length,13);for(const name of ['quote-worker','quote-scheduler','quote-twin','quote-email','offline-installer'])assert(!('ports'in s[name]));
 return result;
}
