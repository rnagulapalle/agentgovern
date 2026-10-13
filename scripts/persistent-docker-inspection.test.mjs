import {beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('node:child_process',()=>({execFile:vi.fn()}));
import {execFile} from 'node:child_process';
import {persistentRoles,normalizeOwnedDockerInspection,inspectOwnedPersistentDocker} from './persistent-docker-inspection.mjs';
let identity,raw;
const copy=v=>structuredClone(v);
beforeEach(()=>{
 vi.mocked(execFile).mockReset();
 identity={project:'ll-platform-012345abcdef',containers:{},images:{}};
 raw=persistentRoles.map((role,n)=>{
  const id=(n+1).toString(16).repeat(64),image=`sha256:${(n+1).toString(16).repeat(64)}`;
  identity.containers[role]=id;identity.images[role]=image;
  return {Id:id,Image:image,Name:`/${identity.project}-${role}-1`,Config:{User:'node',Env:['B=second','A=value=with=equals'],Cmd:['node','worker'],Entrypoint:null,Healthcheck:{Test:['CMD','node','health'],Interval:1000},Labels:{'com.docker.compose.project':identity.project,'com.docker.compose.service':role},WorkingDir:'/app',ExposedPorts:{'9320/tcp':{}}},HostConfig:{Memory:1024,PidsLimit:256,ReadonlyRootfs:true,CapDrop:['ALL'],SecurityOpt:['no-new-privileges'],NetworkMode:`${identity.project}_application`,PortBindings:{}},Mounts:[{Type:'bind',Source:'/private/tls',Destination:'/run/tls',RW:false,Propagation:'rprivate'}],NetworkSettings:{Networks:{[`${identity.project}_application`]:{NetworkID:'a'.repeat(64),EndpointID:'b'.repeat(64),IPAddress:'172.24.0.2',Aliases:[role]}}},State:{Running:true,Health:{Status:'healthy'}}};
 });
});
function refused(){expect(()=>normalizeOwnedDockerInspection(raw,identity)).toThrow('private diagnostics suppressed');}
describe('read-only owned Docker inspection, not lifecycle proof',()=>{
 it('normalizes exact eight roles deterministically while preserving complete security configuration',()=>{
  const a=normalizeOwnedDockerInspection(raw,identity);
  expect(Object.keys(a)).toEqual(persistentRoles);expect(a.web.healthy).toBe(true);
  expect(a.web.configuration).toMatchObject({environment:{A:'value=with=equals',B:'second'},command:['node','worker'],entrypoint:[],host:{dockerConfig:{WorkingDir:'/app',ExposedPorts:{'9320/tcp':{}}},hostConfig:raw[2].HostConfig},mounts:raw[2].Mounts});
  raw.reverse();for(const c of raw)c.Config.Env.reverse();
  expect(normalizeOwnedDockerInspection(raw,identity)).toEqual(a);
 });
 it.each(['Memory','PidsLimit','ReadonlyRootfs','CapDrop','SecurityOpt','NetworkMode','PortBindings'])('preserves HostConfig change %s for refusal by activation',key=>{
  const before=normalizeOwnedDockerInspection(raw,identity);raw[0].HostConfig[key]=({Memory:2048,PidsLimit:128,ReadonlyRootfs:false,CapDrop:['ALL','NET_ADMIN'],SecurityOpt:['different'],NetworkMode:'different',PortBindings:{'9320/tcp':[{HostPort:'9320'}]}})[key];
  expect(normalizeOwnedDockerInspection(raw,identity)).not.toEqual(before);
 });
 it('preserves previously unknown JSON Config/HostConfig/mount fields instead of silently weakening comparison',()=>{
  raw[0].Config.NewAuthorityField={enabled:true};raw[0].HostConfig.FutureIsolation={enabled:true};raw[0].Mounts[0].FuturePermission='restricted';
  const c=normalizeOwnedDockerInspection(raw,identity)['temporal-worker'].configuration;
  expect(c.host.dockerConfig.NewAuthorityField).toEqual({enabled:true});expect(c.host.hostConfig.FutureIsolation).toEqual({enabled:true});expect(c.mounts[0].FuturePermission).toBe('restricted');
 });
 it('does not discard Compose configuration hash changes or changed TLS mounts',()=>{
  const before=normalizeOwnedDockerInspection(raw,identity);raw[0].Config.Labels['com.docker.compose.config-hash']='changed';raw[0].Mounts[0].Source='/other/tls';
  expect(normalizeOwnedDockerInspection(raw,identity)).not.toEqual(before);
 });
 it.each([null,{},[],[{}]])('refuses malformed/missing inspection',value=>{raw=value;refused();});
 it('refuses extra, duplicate and foreign containers',()=>{
  const original=copy(raw);raw.push(copy(raw[0]));refused();raw=copy(original);raw[1]=copy(raw[0]);refused();raw=copy(original);raw[0].Id='f'.repeat(64);refused();
 });
 it.each(['project','service','image','id','running','health'])('refuses wrong %s identity/state',field=>{
  if(field==='project')raw[0].Config.Labels['com.docker.compose.project']='shared';
  if(field==='service')raw[0].Config.Labels['com.docker.compose.service']='web';
  if(field==='image')raw[0].Image='sha256:'+ 'f'.repeat(64);
  if(field==='id')raw[0].Id='tag';
  if(field==='running')raw[0].State.Running='true';
  if(field==='health')raw[0].State.Health.Status='unknown';
  refused();
 });
 it('represents stopped/starting/unhealthy/unconfigured health without inventing readiness',()=>{
  raw[0].State.Running=false;raw[0].State.Health.Status='starting';raw[1].State.Health.Status='unhealthy';delete raw[2].State.Health;
  const r=normalizeOwnedDockerInspection(raw,identity);expect(r['temporal-worker'].running).toBe(false);for(const role of persistentRoles.slice(0,3))expect(r[role].healthy).toBe(false);
 });
 it.each([['A=one','A=two'],['noequals'],['1BAD=value'],[null],['A=\0secret']])('refuses ambiguous/invalid environment',env=>{raw[0].Config.Env=env;refused();});
 it('handles dangerous object-property environment names as literal data',()=>{
  raw[0].Config.Env=['__proto__=literal','constructor=literal'];
  expect(normalizeOwnedDockerInspection(raw,identity)['temporal-worker'].configuration.environment).toEqual(JSON.parse('{"__proto__":"literal","constructor":"literal"}'));
 });
 it.each(['Config','HostConfig','Mounts','State','NetworkSettings'])('refuses missing %s configuration',field=>{delete raw[0][field];refused();});
 it('preserves extra network attachment and endpoint changes in configuration',()=>{const before=normalizeOwnedDockerInspection(raw,identity);raw[0].NetworkSettings.Networks.foreign={NetworkID:'f'.repeat(64),EndpointID:'e'.repeat(64),IPAddress:'172.30.0.2'};expect(normalizeOwnedDockerInspection(raw,identity)).not.toEqual(before);});
 it('refuses malformed network inventories and non-object attachments',()=>{const original=copy(raw);raw[0].NetworkSettings.Networks=[];refused();raw=copy(original);raw[0].NetworkSettings.Networks.foreign='hidden';refused();raw=copy(original);raw[0].NetworkSettings.Networks.foreign={NetworkID:'wrong',EndpointID:'',IPAddress:''};refused();});
 it('refuses accessor/sparse/symbol array entries without invoking getters',()=>{const original=copy(raw),getter=vi.fn(()=>raw[0]);const bad=[];Object.defineProperty(bad,0,{get:getter,enumerable:true});bad.length=8;raw=bad;refused();expect(getter).not.toHaveBeenCalled();raw=copy(original);const env=['A=one'];Object.defineProperty(env,0,{get:getter,enumerable:true});raw[0].Config.Env=env;refused();expect(getter).not.toHaveBeenCalled();raw=copy(original);raw[0].Config.Cmd=new Array(1);refused();raw=copy(original);raw[0].Config.Cmd[Symbol('extra')]=true;refused();});
 it('refuses malformed resource/isolation shapes',()=>{for(const [key,value] of Object.entries({Memory:'1024',PidsLimit:null,ReadonlyRootfs:'true',CapDrop:[1],SecurityOpt:[false],NetworkMode:null,PortBindings:[]})){const original=copy(raw);raw[0].HostConfig[key]=value;refused();raw=original;}});
 it('refuses duplicate/malformed mounts and non-string command entries',()=>{
  const original=copy(raw);raw[0].Mounts.push(copy(raw[0].Mounts[0]));refused();raw=copy(original);raw[0].Mounts[0].RW='false';refused();raw=copy(original);raw[0].Config.Cmd=[1];refused();
 });
 it('refuses non-JSON/accessor/hidden/symbol/cyclic authority values without invoking getter',()=>{
  const original=copy(raw),getter=vi.fn(()=>identity.containers.web);
  Object.defineProperty(raw[0],'Id',{get:getter,enumerable:true});refused();expect(getter).not.toHaveBeenCalled();
  raw=copy(original);Object.defineProperty(raw[0].HostConfig,'secret',{value:true});refused();
  raw=copy(original);raw[0].Config[Symbol('secret')]=true;refused();
  raw=copy(original);raw[0].HostConfig.Bad=()=>true;refused();
  raw=copy(original);raw[0].HostConfig.Bad=raw[0];refused();
 });
 it.each(['project','containers','images','extra'])('refuses invalid trusted inventory %s before Docker',async field=>{
  if(field==='project')identity.project='shared';if(field==='containers')identity.containers.web=identity.containers.temporal;if(field==='images')identity.images.web='latest';if(field==='extra')identity.extra=true;
  await expect(inspectOwnedPersistentDocker(identity)).rejects.toThrow('private diagnostics suppressed');expect(execFile).not.toHaveBeenCalled();
 });
 it('uses bounded execFile without shell, exact owned IDs only, never exposes stderr',async()=>{
  vi.mocked(execFile).mockImplementation((_file,_args,_options,cb)=>{cb(null,JSON.stringify(raw),'private stderr');});
  const value=await inspectOwnedPersistentDocker(identity);expect(value.web.running).toBe(true);
  expect(execFile).toHaveBeenCalledWith('docker',['inspect',...persistentRoles.map(r=>identity.containers[r])],{encoding:'utf8',timeout:10000,maxBuffer:2*1024*1024,windowsHide:true},expect.any(Function));
 });
 it.each(['error','json','oversize'])('sanitizes %s execution failure',async mode=>{
  vi.mocked(execFile).mockImplementation((_f,_a,_o,cb)=>{if(mode==='error')cb(Error('token-private'));else cb(null,mode==='json'?'{credential': 'x'.repeat(2*1024*1024+1),'private');});
  await expect(inspectOwnedPersistentDocker(identity)).rejects.toThrow('private diagnostics suppressed');
 });
});
