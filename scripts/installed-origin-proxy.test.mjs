import {describe,it,expect} from 'vitest';
import {renderInstalledOriginUpstream,renderInstalledOriginPreflight,renderInactiveOriginUpstream,inspectedLoopbackWebEndpoint} from './installed-origin-proxy.mjs';
describe('Fixed origin proxy renderers only',()=>{
 it('renders only a loopback backend and fixed canonical loopback TLS preflight',()=>{expect(renderInstalledOriginUpstream(3199)).toBe('upstream looplabs_application { server 127.0.0.1:3199; keepalive 16; }\nmap $host $looplabs_origin_active { default 1; }\n');const config=renderInstalledOriginPreflight();expect(config).toContain('listen 127.0.0.1:18443 ssl;');expect(config).toContain('server_name looplabs.run;');expect(config).toContain('include /srv/looplabs-production/config/origin-switch/current;');expect(config).not.toContain('listen 443');});
 it('inactive generation refuses requests before any upstream connection',()=>{expect(renderInactiveOriginUpstream()).toContain('map $host $looplabs_origin_active { default 0; }');expect(renderInstalledOriginPreflight()).toContain('if ($looplabs_origin_active = 0) { return 503');});
 it.each([0,443,1023,65536,1.5,NaN,'3199','3199; malicious'])('refuses invalid backend port %s',port=>expect(()=>renderInstalledOriginUpstream(port)).toThrow());
 it('refuses malformed project or image before calling Docker',()=>{for(const input of [{project:'other',imageId:'sha256:'+'a'.repeat(64)},{project:'ll-platform-'+'a'.repeat(12),imageId:'mutable:tag'}]){let calls=0;expect(()=>inspectedLoopbackWebEndpoint(()=>{calls++;},input)).toThrow();expect(calls).toBe(0);}});
});
describe('Owned web endpoint inspection — mocked Docker boundary',()=>{
 const project='ll-platform-'+'a'.repeat(12),imageId='sha256:'+'b'.repeat(64),id='c'.repeat(64);
 function fixture(){
  const value={labels:{'com.docker.compose.project':project,'com.docker.compose.service':'web','com.docker.compose.oneoff':'False','looplabs.assembly.owner':project},image:imageId,state:{Running:true,Health:{Status:'healthy'}},ports:{'3000/tcp':[{HostIp:'127.0.0.1',HostPort:'3199'}]}};
  const docker=(...args)=>{if(args[0]==='ps')return id;if(args[0]==='inspect'){const key=args[2];if(key==='{{json .Config.Labels}}')return JSON.stringify(value.labels);if(key==='{{.Image}}')return value.image;if(key==='{{json .State}}')return JSON.stringify(value.state);if(key==='{{json .NetworkSettings.Ports}}')return JSON.stringify(value.ports);}throw Error('Unexpected Docker observation');};return{value,docker};
 }
 it('uses exact owned healthy image and the actual single loopback mapping',()=>{const f=fixture();expect(inspectedLoopbackWebEndpoint(f.docker,{project,imageId})).toEqual({containerId:id,imageId,host:'127.0.0.1',port:3199});});
 for(const [name,change]of [
  ['foreign owner',v=>v.labels['looplabs.assembly.owner']='other'],
  ['wrong image',v=>v.image='sha256:'+'d'.repeat(64)],
  ['stopped runtime',v=>v.state.Running=false],
  ['unhealthy runtime',v=>v.state.Health.Status='unhealthy'],
  ['wildcard binding',v=>v.ports['3000/tcp'][0].HostIp='0.0.0.0'],
  ['additional binding',v=>v.ports['3000/tcp'].push({HostIp:'::1',HostPort:'3199'})],
  ['additional exposed port',v=>v.ports['9315/tcp']=null],
  ['malformed port',v=>v.ports['3000/tcp'][0].HostPort='3199; injected'],
  ['privileged port',v=>v.ports['3000/tcp'][0].HostPort='443']
 ])it('refuses '+name,()=>{const f=fixture();change(f.value);expect(()=>inspectedLoopbackWebEndpoint(f.docker,{project,imageId})).toThrow();});
});

import {renderInstalledOriginProduction,installedOriginProductionService} from './installed-origin-proxy.mjs';
describe('Production ingress construction only — no listener or privilege proof',()=>{
 const directory='/srv/looplabs-production/releases/'+'a'.repeat(64)+'/proxy',options={imageId:'sha256:'+'b'.repeat(64),configurationFile:'/srv/looplabs-production/config/origin-reference/nginx-production.conf',upstreamDirectories:[directory]};
 it('changes only the preflight listen directive to canonical443 and keeps TLS/private include/inactive503',()=>{expect(renderInstalledOriginProduction()).toBe(renderInstalledOriginPreflight().replace('listen 127.0.0.1:18443 ssl;','listen 443 ssl;'));expect(renderInstalledOriginProduction()).not.toMatch(/listen 80|ssl_protocols TLSv1\.0|ssl_verify.*off/);});
 it('uses host network and only bind-service capability with fixed1001 and readonly exact mounts',()=>{const s=installedOriginProductionService(options);expect(s.user).toBe('1001:1001');expect(s.network_mode).toBe('host');expect(s.cap_drop).toEqual(['ALL']);expect(s.cap_add).toEqual(['NET_BIND_SERVICE']);expect(s.security_opt).toEqual(['no-new-privileges:true']);expect(s.read_only).toBe(true);expect(s).not.toHaveProperty('ports');expect(s).not.toHaveProperty('privileged');expect(s).not.toHaveProperty('environment');expect(s.volumes.every(v=>v.read_only)).toBe(true);expect(s.volumes.map(v=>v.source)).not.toContain('/var/run/docker.sock');expect(s.volumes.map(v=>v.source)).not.toContain('/srv/looplabs-production/releases');});
 it.each([{imageId:'nginx:latest'},{configurationFile:'/tmp/nginx.conf'},{upstreamDirectories:['/srv/looplabs-production/state/installation']},{upstreamDirectories:[directory,directory]},{upstreamDirectories:[directory+'/../other']},{upstreamDirectories:[]}])('refuses expanded mutable configuration/mounts %j',change=>expect(()=>installedOriginProductionService({...options,...change})).toThrow());
});
