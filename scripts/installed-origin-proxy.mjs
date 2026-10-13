// Fixed canonical origin preparation. No listener start, DNS or activation.
import assert from 'node:assert/strict';
import {installedServiceContainerId} from './staging-installed-host-coordinator.mjs';
const root='/srv/looplabs-production';
export function inspectedLoopbackWebEndpoint(docker,{project,imageId}){
 assert(/^ll-platform-[a-f0-9]{12}$/.test(project));assert(/^sha256:[a-f0-9]{64}$/.test(imageId));
 const id=installedServiceContainerId({project,owner:project,service:'web',docker});assert(id,'Owned web container required');
 assert.equal(docker('inspect','--format','{{.Image}}',id),imageId);
 const state=JSON.parse(docker('inspect','--format','{{json .State}}',id));assert.equal(state.Running,true);assert.equal(state.Health?.Status,'healthy');
 const ports=JSON.parse(docker('inspect','--format','{{json .NetworkSettings.Ports}}',id));assert.deepEqual(Object.keys(ports),['3000/tcp']);
 const bindings=ports['3000/tcp'];assert(Array.isArray(bindings)&&bindings.length===1);assert.deepEqual(Object.keys(bindings[0]).sort(),['HostIp','HostPort']);assert.equal(bindings[0].HostIp,'127.0.0.1');
 const value=bindings[0].HostPort;assert(typeof value==='string'&&/^[1-9][0-9]{3,4}$/.test(value));const port=Number(value);assert(port>=1024&&port<=65535);
 return Object.freeze({containerId:id,imageId,host:'127.0.0.1',port});
}
export function renderInstalledOriginUpstream(port){
 assert(Number.isSafeInteger(port)&&port>=1024&&port<=65535);
 return `upstream looplabs_application { server 127.0.0.1:${port}; keepalive 16; }\nmap $host $looplabs_origin_active { default 1; }\n`;
}
export function renderInactiveOriginUpstream(){return 'upstream looplabs_application { server 127.0.0.1:9; }\nmap $host $looplabs_origin_active { default 0; }\n';}
// Preflight is loopback-only. A public listener is a separate deployment change.
export function renderInstalledOriginPreflight(){
 return `pid /tmp/nginx.pid;
error_log /dev/stderr warn;
events { worker_connections 256; }
http {
  access_log /dev/stdout;
  client_body_temp_path /tmp/client_body;
  proxy_temp_path /tmp/proxy;
  fastcgi_temp_path /tmp/fastcgi;
  uwsgi_temp_path /tmp/uwsgi;
  scgi_temp_path /tmp/scgi;
  include ${root}/config/origin-switch/current;
  server {
    listen 127.0.0.1:18443 ssl;
    server_name looplabs.run;
    ssl_certificate ${root}/config/origin-tls/fullchain.pem;
    ssl_certificate_key ${root}/config/origin-tls/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    location / {
      if ($looplabs_origin_active = 0) { return 503 "Application has not been activated.\\n"; }
      proxy_pass http://looplabs_application;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-Proto https;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_intercept_errors on;
      error_page 502 503 504 =503 /__looplabs_origin_unavailable;
    }
    location = /__looplabs_origin_unavailable { internal; return 503 "Application has not been activated.\\n"; }
  }
}\n`;
}

/** Production listener render only. The source-owned deployment coordinator
 * must validate the existing TLS material and exclusive port ownership first. */
export function renderInstalledOriginProduction(){
 const preflight=renderInstalledOriginPreflight();assert.equal(preflight.split('listen 127.0.0.1:18443 ssl;').length,2);
 return preflight.replace('listen 127.0.0.1:18443 ssl;','listen 443 ssl;');
}
/** Fixed host-network coupling to the inspected 127.0.0.1 web publication.
 * Only NET_BIND_SERVICE is retained; no privileged container or Docker socket.
 * No listener is started by this constructor. Each exact proxy directory is
 * mounted separately, never all releases or any role credential directory. */
export function installedOriginProductionService({imageId,configurationFile,upstreamDirectories}){
 assert(/^sha256:[a-f0-9]{64}$/.test(imageId));assert.equal(configurationFile,root+'/config/origin-reference/nginx-production.conf');
 assert(Array.isArray(upstreamDirectories)&&upstreamDirectories.length>=1&&upstreamDirectories.length<=2&&new Set(upstreamDirectories).size===upstreamDirectories.length);
 for(const directory of upstreamDirectories)assert(new RegExp('^'+root+'/releases/[a-f0-9]{64}/proxy$').test(directory));
 const bind=source=>({type:'bind',source,target:source,read_only:true});
 return {image:imageId,user:'1001:1001',read_only:true,network_mode:'host',restart:'unless-stopped',cap_drop:['ALL'],cap_add:['NET_BIND_SERVICE'],security_opt:['no-new-privileges:true'],pids_limit:64,mem_limit:'128m',memswap_limit:'128m',init:true,
 labels:{'looplabs.origin.owner':'looplabs-production','looplabs.origin.contract':'installed-origin-reference-1'},entrypoint:['nginx'],command:['-c',configurationFile,'-g','daemon off;'],
 volumes:[bind(root+'/config/origin-reference'),bind(root+'/config/origin-switch'),bind(root+'/config/origin-tls'),...upstreamDirectories.map(bind)],tmpfs:['/tmp:rw,nosuid,nodev,noexec,size=16777216,uid=1001,gid=1001,mode=0700'],healthcheck:{test:['CMD','nginx','-t','-c',configurationFile],interval:'10s',timeout:'4s',retries:3}};
}
