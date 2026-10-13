import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseTransferredCanonicalRenewalConfig} from './installed-origin-renewal-setup.mjs';
const config='[renewalparams]\naccount = '+ 'a'.repeat(32)+'\nserver = https://acme-v02.api.letsencrypt.org/directory\n[[webroot_map]]\nlooplabs.run = /old\nwww.looplabs.run = /old\n';
describe('Private preparation boundaries — parser and source structure, not installation',()=>{
 it('accepts only one current production account with both canonical host entries',()=>expect(parseTransferredCanonicalRenewalConfig(config)).toBe('a'.repeat(32)));
 for(const [name,input]of [['duplicate account',config+'account = '+'b'.repeat(32)+'\n'],['wrong server',config.replace('acme-v02.api.letsencrypt.org','acme-staging-v02.api.letsencrypt.org')],['missingwww',config.replace('www.looplabs.run = /old\n','')],['traversalaccount',config.replace('a'.repeat(32),'../escape')],['carriagereturn',config+'\r']])it('refuses '+name,()=>expect(()=>parseTransferredCanonicalRenewalConfig(input)).toThrow());
 it('pins all three actual publisher/bootstrap/TLS source bytes',()=>{const source=readFileSync(new URL('./installed-origin-renewal-setup.mjs',import.meta.url),'utf8');for(const name of ['installed-origin-tls.mjs','installed-origin-initial-tls.mjs','installed-origin-renewal-publisher.mjs']){const hash=createHash('sha256').update(readFileSync(new URL('./'+name,import.meta.url))).digest('hex');expect(source).toContain(JSON.stringify(name)+':'+JSON.stringify(hash));}});
 it('setup never enables/starts timers or listeners and masks only absent/default Certbot units before apt',()=>{const source=readFileSync(new URL('./installed-origin-renewal-setup.mjs',import.meta.url),'utf8');expect(source).not.toMatch(/\['(?:enable|start|restart)'/);expect(source.indexOf("['mask','certbot.service','certbot.timer']")).toBeLessThan(source.indexOf("['install','-y','--no-install-recommends','certbot']"));expect(source).toContain("['not-found','masked'].includes(state)");expect(source).toContain("'disabled','Canonical timer must remain disabled'");expect(source).toContain('{uid:1001,gid:1001}');});
});
