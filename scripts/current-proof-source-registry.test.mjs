import {test,expect,vi} from 'vitest';
// Source graph reconstruction is a provenance check, not product latency.
// Match the bounded discovery-evidence deadline; retain every refusal assertion.
vi.setConfig({testTimeout:30000});
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {constructCurrentProofRegistry,validateCurrentProofRegistry} from './current-proof-source-registry.mjs';
test('current construction covers installed web, both compiled profiles, scope setup and proof helpers without accepting historical evidence',()=>{
 const registry=constructCurrentProofRegistry();expect(registry.contract).toBe('installed-platform-proof-source-1');
 expect(registry.families.web).toContain('app/api/workspace/discovery/approvals/route.ts');expect(registry.families.discovery).toContain('app/api/workspace/discovery/approvals/route.ts');expect(registry.families.web).toContain('lib/workspace/tenant-bootstrap.ts');expect(registry.families.web).toContain('lib/quotes/transaction-context.ts');
 for(const file of ['app/control-plane/actions/page.tsx','app/control-plane/agents/page.tsx','app/control-plane/workflow-runs/page.tsx','app/control-plane/history/page.tsx','app/api/workspace/agents/route.ts','app/api/durable/route.ts','components/control-plane/discount-history.tsx','components/control-plane/saved-history-workspace.tsx','lib/durable/history-export.ts'])expect(registry.families.web).toContain(file);
 expect(registry.families.quote).toContain('runtime/temporal/pinned-quote-workflow.ts');expect(registry.families.ack).toContain('runtime/temporal/pinned-workflow.ts');
 expect(registry.families.chat).toContain('scripts/chat-ui-installed-fixture.ts');expect(registry.families.load).toContain('scripts/temporal-installed-fixture.ts');expect(registry.families.gateway).toContain('scripts/gateway-installed-fixture.ts');
 expect(registry.families.assembly).toContain('scripts/staging-installed-publication.ts');expect(registry.families.assembly).toContain('lib/durable/workload-pool.ts');expect(registry.families.assembly).toContain('scripts/worker-artifact-enrollment.mjs');
 expect(validateCurrentProofRegistry(registry)).toBe(true);
});
test.each(['missing','extra','altered','edge'])('exact current registry rejects %s dependency construction',kind=>{
 const registry=constructCurrentProofRegistry(),copy=structuredClone(registry),file='lib/workspace/tenant-bootstrap.ts';
 if(kind==='missing')delete copy.sourceFingerprints[file];
 if(kind==='extra')copy.sourceFingerprints['missing-extra-source.ts']='a'.repeat(64);
 if(kind==='altered')copy.sourceFingerprints[file]='a'.repeat(64);
 if(kind==='edge')copy.edges.pop();
 expect(()=>validateCurrentProofRegistry(copy)).toThrow();
});
test('new transitive import and dynamic import change closure; missing dependency fails construction',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ll-source-closure-'));
 try{
  for(const f of constructCurrentProofRegistry().families.web){mkdirSync(join(dir,f,'..'),{recursive:true});writeFileSync(join(dir,f),readFileSync(f));}
  // Real TypeScript parser dependency only; no application/runtime execution.
  mkdirSync(join(dir,'node_modules')); symlinkSync(join(process.cwd(),'node_modules/typescript'),join(dir,'node_modules/typescript'),'dir');
  writeFileSync(join(dir,'root.ts'),"export {x} from './a';\n");writeFileSync(join(dir,'a.ts'),'export const x=1;\n');const roots={test:['root.ts']};const first=constructCurrentProofRegistry(dir,roots);
  writeFileSync(join(dir,'a.ts'),"export const x=1;export async function f(){return import('./b');}\n");writeFileSync(join(dir,'b.ts'),'export const y=2;\n');const second=constructCurrentProofRegistry(dir,roots);expect(second.families.test).toContain('b.ts');expect(second.sourceFingerprints).not.toEqual(first.sourceFingerprints);
  rmSync(join(dir,'b.ts'));expect(()=>constructCurrentProofRegistry(dir,roots)).toThrow('Current dependency closure incomplete');
  const outside=mkdtempSync(join(tmpdir(),'ll-source-outside-'));try{writeFileSync(join(outside,'outside.ts'),'export const y=2;\n');symlinkSync(join(outside,'outside.ts'),join(dir,'b.ts'));expect(()=>constructCurrentProofRegistry(dir,roots)).toThrow('Source symlink or ancestry refused');}finally{rmSync(outside,{recursive:true,force:true});}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
