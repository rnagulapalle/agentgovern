// Tests gate orchestration only. These stubs do not establish compiled or runtime proof.
import {test,expect} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const gate=readFileSync(new URL('./quality-gate.sh',import.meta.url),'utf8');
const commands=['pnpm check:repo','pnpm lint','pnpm typecheck','pnpm temporal:build','node scripts/build-temporal-worker.mjs quote','pnpm test:coverage','node --import tsx scripts/staging-database-proof.mjs','node scripts/build-enquiry-worker.mjs','pnpm build','pnpm check:links','git diff --check'];
function attempt(fail=''){
 const root=mkdtempSync(join(tmpdir(),'ll-gate-order-'));try{
  const scripts=join(root,'scripts'),bin=join(root,'bin'),trace=join(root,'trace');mkdirSync(scripts);mkdirSync(bin);writeFileSync(join(scripts,'quality-gate.sh'),gate);
  for(const tool of ['pnpm','node','git'])writeFileSync(join(bin,tool),`#!/bin/sh\ncommand="${tool} $*"\nprintf '%s\\n' "$command" >> "$TRACE"\nif [ "$command" = "$FAIL" ]; then exit 23; fi\nif [ "$command" = 'pnpm temporal:build' ]; then touch "$FIXTURE/ack-built"; fi\nif [ "$command" = 'node scripts/build-temporal-worker.mjs quote' ]; then touch "$FIXTURE/quote-built"; fi\nif [ "$command" = 'pnpm test:coverage' ]; then test -f "$FIXTURE/ack-built" && test -f "$FIXTURE/quote-built" || exit 24; fi\n`,{mode:0o700});
  const result=spawnSync('/bin/bash',[join(scripts,'quality-gate.sh')],{env:{PATH:bin+':/usr/bin:/bin',TRACE:trace,FIXTURE:root,FAIL:fail},encoding:'utf8',timeout:10000});
  return {status:result.status,trace:readFileSync(trace,'utf8').trim().split('\n'),stdout:result.stdout};
 }finally{rmSync(root,{recursive:true,force:true});}
}
test('clean gate creates both workflow prerequisites before unfiltered coverage and retains every later gate',()=>{
 const result=attempt();expect(result.status).toBe(0);expect(result.trace).toEqual(commands);expect(result.stdout).toContain('All quality gates passed.');
});
test.each(['pnpm temporal:build','node scripts/build-temporal-worker.mjs quote'])('failed prerequisite %s prevents coverage and all downstream gate claims',command=>{
 const result=attempt(command);expect(result.status).toBe(23);expect(result.trace).toEqual(commands.slice(0,commands.indexOf(command)+1));expect(result.trace).not.toContain('pnpm test:coverage');expect(result.stdout).not.toContain('All quality gates passed.');
});
test('coverage or source-bound evidence failure remains fatal and cannot be bypassed by build readiness',()=>{
 const result=attempt('pnpm test:coverage');expect(result.status).toBe(23);expect(result.trace).toEqual(commands.slice(0,6));expect(result.stdout).not.toContain('All quality gates passed.');
});
