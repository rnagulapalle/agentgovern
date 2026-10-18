// Construction only. No ACME request, lineage transfer, hook execution, timer,
// public listener or deployment authority is established by these values.
import assert from 'node:assert/strict';
import {renderInstalledOriginProduction,installedOriginProductionService} from './installed-origin-proxy.mjs';
const root='/srv/looplabs-production';
export const installedOriginAcmePaths=Object.freeze({config:'/etc/letsencrypt-looplabs',work:'/var/lib/looplabs-acme',logs:'/var/log/looplabs-acme',webroot:root+'/state/acme-webroot',hook:'/usr/local/libexec/looplabs-origin-renewal-hook'});
/** Migrate only the observed existing lineage and its one existing account.
 * Returned path selection is not proof of the contents, ownership or transfer.
 * The transfer process must revalidate every source and preserve relative live
 * symlinks only after proving they resolve inside this archive directory. */
export function installedOriginLineageSelection({accountId,archiveGeneration}){
 assert(typeof accountId==='string'&&/^[a-f0-9]{32}$/.test(accountId));assert(Number.isSafeInteger(archiveGeneration)&&archiveGeneration>=1&&archiveGeneration<=1000000);
 const account=`accounts/acme-v02.api.letsencrypt.org/directory/${accountId}`;
 const result={regularFiles:[...['meta.json','private_key.json','regr.json'].map(file=>account+'/'+file),'renewal/looplabs.run.conf',...['cert','chain','fullchain','privkey'].map(name=>`archive/looplabs.run/${name}${archiveGeneration}.pem`)],liveLinks:Object.fromEntries(['cert','chain','fullchain','privkey'].map(name=>[`live/looplabs.run/${name}.pem`,`../../archive/looplabs.run/${name}${archiveGeneration}.pem`])),sourceRoot:'/etc/letsencrypt',destinationRoot:installedOriginAcmePaths.config,establishesRenewal:false};
 return Object.freeze(result);
}
/** Exact lineages only; does not retain old app paths or old deploy hooks. */
export function renderInstalledOriginRenewalConfiguration(accountId){
 installedOriginLineageSelection({accountId,archiveGeneration:1});const p=installedOriginAcmePaths;
 return `archive_dir = ${p.config}/archive/looplabs.run\ncert = ${p.config}/live/looplabs.run/cert.pem\nprivkey = ${p.config}/live/looplabs.run/privkey.pem\nchain = ${p.config}/live/looplabs.run/chain.pem\nfullchain = ${p.config}/live/looplabs.run/fullchain.pem\n\n[renewalparams]\naccount = ${accountId}\nserver = https://acme-v02.api.letsencrypt.org/directory\nauthenticator = webroot\nwebroot_path = ${p.webroot}\n\n[[webroot_map]]\nlooplabs.run = ${p.webroot}\nwww.looplabs.run = ${p.webroot}\n`;
}
export function installedOriginCertbotArguments({dryRun=false}={}){
 assert(typeof dryRun==='boolean');const p=installedOriginAcmePaths;
 return ['renew','--non-interactive','--cert-name','looplabs.run','--config-dir',p.config,'--work-dir',p.work,'--logs-dir',p.logs,'--webroot','--webroot-path',p.webroot,...(dryRun?['--dry-run']:['--deploy-hook',p.hook])];
}
export function renderInstalledOriginRenewalUnits(){
 const command=['/usr/bin/certbot',...installedOriginCertbotArguments()].join(' ');
 return Object.freeze({service:`[Unit]\nDescription=Renew canonical LoopLabs origin certificate only\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nType=oneshot\nUser=root\nGroup=root\nUMask=0077\nExecStart=${command}\nPrivateTmp=true\nNoNewPrivileges=true\nProtectHome=true\nTimeoutStartSec=900\n\n`,timer:'[Unit]\nDescription=Check canonical LoopLabs origin certificate twice daily\n\n[Timer]\nOnCalendar=*-*-* 00,12:00:00\nRandomizedDelaySec=3600\nPersistent=true\nUnit=looplabs-origin-renewal.service\n\n[Install]\nWantedBy=timers.target\n'});
}
export function renderRenewableInstalledOriginProduction(){
 const old=renderInstalledOriginProduction();assert(old.includes(root+'/config/origin-tls/fullchain.pem'));assert(old.includes(root+'/config/origin-tls/privkey.pem'));
 const config=old.replaceAll(root+'/config/origin-tls/fullchain.pem',root+'/config/origin-tls/current/fullchain.pem').replaceAll(root+'/config/origin-tls/privkey.pem',root+'/config/origin-tls/current/privkey.pem');
 // Only the ACME token path is served over HTTP. All other HTTP requests go
 // directly to the fixed canonical HTTPS origin; Host input never forms URLs.
 const challenge=`  server {\n    listen 80;\n    server_name looplabs.run www.looplabs.run;\n    location ^~ /.well-known/acme-challenge/ { root ${installedOriginAcmePaths.webroot}; default_type text/plain; try_files $uri =404; }\n    location / { return 301 https://looplabs.run$request_uri; }\n  }\n  server {\n    listen 443 ssl;\n    server_name www.looplabs.run;\n    ssl_certificate ${root}/config/origin-tls/current/fullchain.pem;\n    ssl_certificate_key ${root}/config/origin-tls/current/privkey.pem;\n    ssl_protocols TLSv1.2 TLSv1.3;\n    location / { return 301 https://looplabs.run$request_uri; }\n  }\n`;
 assert.equal(config.split('\n  server {').length,2);return config.replace('\n  server {','\n'+challenge+'  server {');
}
export function renewableInstalledOriginProductionService(options){
 const service=installedOriginProductionService(options);
 return {...service,volumes:[...service.volumes,{type:'bind',source:installedOriginAcmePaths.webroot,target:installedOriginAcmePaths.webroot,read_only:true}]};
}
