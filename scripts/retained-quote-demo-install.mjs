// Standard-entry canonical sample installation. No DNS/origin activation and no
// broad enterprise eligibility. Inputs are fixed owned files, never CLI JSON.
import assert from 'node:assert/strict';
import {realpath,lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {runPersistentInstalledTrial} from './persistent-installed-trial-core.mjs';
assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');assert.equal(process.getuid(),1001);
assert.equal(process.argv.length,2,'No caller install/eligibility arguments');
assert(/^\/srv\/looplabs-production\/releases\/[a-f0-9]{40}\/app$/.test(process.cwd()));
for(const path of ['/srv/looplabs-production/private/planner-input.json','/srv/looplabs-production/private/operator-members.json']){const s=await lstat(path);assert(s.isFile()&&!s.isSymbolicLink()&&s.uid===1001&&s.nlink===1&&(s.mode&0o777)===0o600);assert.equal(await realpath(path),path);}
const provider=await realpath('/srv/looplabs-production/config/provider-source');assert(provider.startsWith('/home/looplabs/')||provider.startsWith('/srv/looplabs-production/provider/'));
for(const key of Object.keys(process.env))assert(!key.startsWith('AWS_'),'Host credentials must not be inherited');
process.env.LOOPLABS_PERSISTENT_RUNTIME_PROOF='isolated';
process.env.LOOPLABS_RETAINED_QUOTE_DEMO='explicit-canonical-sample';
process.env.LOOPLABS_STAGING_PLATFORM_PROOF='isolated';
process.env.LOOPLABS_INSTALLED_DEDICATED_LINUX_PROOF='isolated';
process.env.FETCHSANDBOX_BACKEND_PATH=provider;
process.env.LOOPLABS_PERSISTENT_RUNTIME_EVIDENCE=resolve(process.cwd(),'../installation');
await runPersistentInstalledTrial('retained-quote-demo');
