// Explicit preparation only. Native package/source/account installation is not
// application acceptance. Never enable/start a timer, listener or DNS here.
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {open,lstat,realpath,mkdir,writeFile,rename} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {renderInstalledOriginRenewalUnits,renderInstalledOriginRenewalConfiguration,installedOriginLineageSelection} from './installed-origin-renewal.mjs';
const base='/etc/letsencrypt-looplabs',library='/usr/local/lib/looplabs-origin',hook='/usr/local/libexec/looplabs-origin-renewal-hook';
const escapeRegex=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const sources=['installed-origin-tls.mjs','installed-origin-initial-tls.mjs','installed-origin-renewal-publisher.mjs'];
const sourceHashes=Object.freeze({"installed-origin-tls.mjs":"0a9a3a3b21a381a4d5a840f699e6b68f350167b791364d234fca09c3205f0ff8","installed-origin-initial-tls.mjs":"4ced5495b88363d65a38e7aa8597bf38e56ab73439d13f66a5a6a395e28e0a35","installed-origin-renewal-publisher.mjs":"0d03c6c0ce9a82a617a49ab4e650af8db7935f54dbb347af574a9d4c0a4349d5"});
const exec=(program,args,extra={})=>execFileSync(program,args,{encoding:'utf8',timeout:300000,maxBuffer:1048576,stdio:['ignore','pipe','pipe'],...extra}).trim();
async function ownedDirectory(path,mode=0o700){const s=await lstat(path);assert(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===0&&(s.mode&0o777)===mode,'Root-owned setup directory required');assert.equal(await realpath(path),path);}
async function readPrivate(path){const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const s=await h.stat();assert(s.isFile()&&s.uid===0&&s.nlink===1&&(s.mode&0o777)===0o600&&s.size>0&&s.size<65536,'Root-owned private transfer file required');return await h.readFile();}finally{await h.close();}}
async function mkdirOwned(path,mode){try{await mkdir(path,{mode});}catch(e){if(e.code!=='EEXIST')throw e;}await ownedDirectory(path,mode);}
async function installExact(path,bytes,mode){
 try{const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const s=await h.stat();assert(s.isFile()&&s.uid===0&&s.nlink===1&&(s.mode&0o777)===mode);assert((await h.readFile()).equals(Buffer.from(bytes)),'Existing installed source differs; explicit reviewed transition required');return;}finally{await h.close();}}
 catch(e){if(e.code!=='ENOENT')throw e;}await writeFile(path,bytes,{mode,flag:'wx'});
}
export function parseTransferredCanonicalRenewalConfig(text){
 assert(typeof text==='string'&&!/[\r\0]/.test(text));const matches=[...text.matchAll(/^account\s*=\s*([a-f0-9]{32})\s*$/gm)];assert.equal(matches.length,1);assert(/^server\s*=\s*https:\/\/acme-v02\.api\.letsencrypt\.org\/directory\s*$/m.test(text));assert(/^looplabs\.run\s*=/m.test(text)&&/^www\.looplabs\.run\s*=/m.test(text));return matches[0][1];
}
/** Fixed root-owned installed coordinator. Caller supplies no eligibility JSON,
 * target path, command, account contents or image authority. Lineage must have
 * been confidentially transferred beforehand into the isolated private base. */
export async function prepareInstalledOriginRenewal(){
 assert.equal(process.getuid(),0);assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');assert.equal(process.env.LOOPLABS_ORIGIN_RENEWAL_SETUP,'explicit-private-preparation');
 for(const property of ['ActiveState','UnitFileState']){const state=exec('/usr/bin/systemctl',['show','--property='+property,'--value','looplabs-origin-renewal.timer']);assert(property==='ActiveState'?state==='inactive':['','disabled'].includes(state),'Existing canonical timer requires separate transition');}
 await ownedDirectory(base);await ownedDirectory(base+'/renewal');await ownedDirectory(base+'/archive');await ownedDirectory(base+'/archive/looplabs.run');await ownedDirectory(base+'/live');await ownedDirectory(base+'/live/looplabs.run');
 const renewalPath=base+'/renewal/looplabs.run.conf',previous=await readPrivate(renewalPath),account=parseTransferredCanonicalRenewalConfig(previous.toString());
 let generation;
 for(const name of ['cert','chain','fullchain','privkey']){const path=base+'/live/looplabs.run/'+name+'.pem';const s=await lstat(path);assert(s.isSymbolicLink()&&s.uid===0);const target=await realpath(path),match=target.match(new RegExp('^'+escapeRegex(base+'/archive/looplabs.run/'+name)+'([1-9][0-9]*)\\.pem$'));assert(match);if(generation===undefined)generation=Number(match[1]);else assert.equal(Number(match[1]),generation);await readPrivate(target);}
 const selection=installedOriginLineageSelection({accountId:account,archiveGeneration:generation});for(const file of selection.regularFiles)await readPrivate(base+'/'+file);
 // Account JSON syntax and exact private material are validated without logging
 // account registration or its private key. No fresh ACME registration here.
 for(const name of ['meta','private_key','regr']){const value=JSON.parse((await readPrivate(base+'/accounts/acme-v02.api.letsencrypt.org/directory/'+account+'/'+name+'.json')).toString());assert(value&&typeof value==='object'&&!Array.isArray(value));}
 await ownedDirectory('/usr/local/lib',0o755);await mkdirOwned(library,0o755);await ownedDirectory('/usr/local',0o755);await mkdirOwned('/usr/local/libexec',0o755);
 for(const name of sources){const source=fileURLToPath(new URL(name,import.meta.url));const bytes=await open(source,constants.O_RDONLY|constants.O_NOFOLLOW).then(async h=>{try{const s=await h.stat();assert(s.isFile()&&s.nlink===1&&(s.mode&0o022)===0&&s.size<65536);return await h.readFile();}finally{await h.close();}});assert.equal(createHash('sha256').update(bytes).digest('hex'),sourceHashes[name],'Reviewed publisher source changed');await installExact(library+'/'+name,bytes,0o644);}
 await installExact(hook,'#!/usr/bin/env bash\nset -euo pipefail\nexec /usr/bin/node /usr/local/lib/looplabs-origin/installed-origin-renewal-publisher.mjs\n',0o755);
 // The coordinator does not alter unrelated native Certbot service/timer units.
 // Package installation must not autostart the distribution's broad timer.
 // Refuse any existing unreviewed/default renewal service instead of stopping it.
 for(const unit of ['certbot.service','certbot.timer']){const state=exec('/usr/bin/systemctl',['show','--property=LoadState','--value',unit]);assert(['not-found','masked'].includes(state),'Existing Certbot unit requires separate transition');}
 exec('/usr/bin/systemctl',['mask','certbot.service','certbot.timer']);
 exec('/usr/bin/apt-get',['update']);exec('/usr/bin/apt-get',['install','-y','--no-install-recommends','certbot']);for(const unit of ['certbot.service','certbot.timer']){assert.equal(exec('/usr/bin/systemctl',['show','--property=LoadState','--value',unit]),'masked','Distribution Certbot unit unmasked during package installation');assert.equal(exec('/usr/bin/systemctl',['show','--property=ActiveState','--value',unit]),'inactive','Distribution Certbot unit started during package installation');}const version=exec('/usr/bin/certbot',['--version']);assert(/^certbot [1-9][0-9]*\.[0-9]+/.test(version));
 const rendered=Buffer.from(renderInstalledOriginRenewalConfiguration(account));if(!previous.equals(rendered)){await installExact(renewalPath+'.pre-migration',previous,0o600);const next=renewalPath+'.prepared';await writeFile(next,rendered,{mode:0o600,flag:'wx'});await rename(next,renewalPath);}
 await mkdirOwned('/var/lib/looplabs-acme',0o700);await mkdirOwned('/var/log/looplabs-acme',0o700);
 const units=renderInstalledOriginRenewalUnits();await ownedDirectory('/etc/systemd/system',0o755);for(const [name,content]of [['service',units.service],['timer',units.timer]])await installExact('/etc/systemd/system/looplabs-origin-renewal.'+name,content,0o644);
 exec('/usr/bin/systemctl',['daemon-reload']);const active=exec('/usr/bin/systemctl',['show','--property=ActiveState','--value','looplabs-origin-renewal.timer']);assert.equal(active,'inactive','Existing renewal timer must not be active during preparation');assert.equal(exec('/usr/bin/systemctl',['show','--property=UnitFileState','--value','looplabs-origin-renewal.timer']),'disabled','Canonical timer must remain disabled');
 // Bootstrap as the operator, never root-write within its mutable TLS tree.
 const initial=JSON.parse(exec('/usr/bin/node',[library+'/installed-origin-initial-tls.mjs'],{uid:1001,gid:1001}));assert.equal(initial.contract,'initial-origin-tls-layout-1');assert.equal(initial.renewalEstablished,false);
 return {contract:'installed-origin-renewal-preparation-1',certbotVersion:version,existingAccountReused:true,initialTlsLayout:initial,sourceHookInstalled:true,timerInstalled:true,timerStarted:false,timerEnabled:false,distributionCertbotUnitsMasked:true,acmeDryRunExecuted:false,renewalEstablished:false,applicationReleaseGranted:false,dnsChanged:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url))prepareInstalledOriginRenewal().then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('Private canonical renewal preparation refused or failed; no timer activation or renewal proof established.');process.exitCode=1;});
