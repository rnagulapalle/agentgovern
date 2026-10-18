// Unit source-construction fixtures only; no release or execution authority.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export function unsupportedInstalledParent(){
 const live=readFileSync(new URL('./staging-platform-proof.mjs',import.meta.url),'utf8');
 if(live.includes('fullInstalledAcceptance:false'))return live;
 // Canonical checkout still has the v1 producer. Exercise v2 refusal using the
 // exact source from the independently retained isolated trial24, never execute it.
 const bytes=readFileSync(new URL('./test-fixtures/installed-quote-parent-v2.mjs.txt',import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'8198ab074797dab281002acfacfffaf610968887efa2e7002a47250862199456');
 const source=bytes.toString('utf8');assert(source.includes('fullInstalledAcceptance:false'));return source;
}
