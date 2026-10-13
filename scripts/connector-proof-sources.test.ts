import { expect,test } from 'vitest';
import ts from 'typescript';
import { readFile,mkdtemp,writeFile,rm } from 'node:fs/promises';
import { resolve,relative,join } from 'node:path';
import { tmpdir } from 'node:os';
import { connectorProofSources,validateConnectorProofSources } from './connector-proof-sources';
async function actualClosure(){
 const root=process.cwd(),config=ts.readConfigFile(resolve('tsconfig.json'),ts.sys.readFile),options=ts.parseJsonConfigFileContent(config.config,ts.sys,root).options;
 const pending=['scripts/connector-proof.ts','scripts/connector-proof-worker.ts','scripts/workflow-http-proof-server.ts','scripts/workflow-agent.mjs'],seen=new Set<string>(),edges:string[][]=[];
 while(pending.length){const file=pending.pop()!;if(seen.has(file))continue;seen.add(file);const source=ts.createSourceFile(file,await readFile(file,'utf8'),ts.ScriptTarget.Latest,true);
  function visit(node:ts.Node){if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)){const resolvedImport=ts.resolveModuleName(node.moduleSpecifier.text,resolve(file),options,ts.sys).resolvedModule;if(resolvedImport&&!resolvedImport.isExternalLibraryImport){const path=relative(root,resolvedImport.resolvedFileName);pending.push(path);edges.push([file,path]);}}ts.forEachChild(node,visit);}visit(source);
 }return {seen,edges};
}
test('closed source registry covers actual transitive child/bootstrap imports and all installed schemas before effects',async()=>{
 const {seen:closure,edges}=await actualClosure(),inventory=new Set<string>(connectorProofSources);
 for(const file of closure)expect(inventory.has(file),`Unmeasured dependency ${file}`).toBe(true);
 const schemas=JSON.parse(await readFile('install-order.json','utf8')) as string[];for(const file of schemas)expect(inventory.has(file)).toBe(true);
 const construction=['install-order.json','lib/durable/tenant-boundary-prototype-schema.sql','lib/enquiries/runner.ts','package.json','pnpm-lock.yaml','runtime/temporal/record-routing.ts','scripts/connector-twin.py','tsconfig.json'];
 expect([...inventory].sort()).toEqual([...new Set([...closure,...schemas,...construction])].sort());
 for(const file of ['lib/workspace/tenant-bootstrap.ts','lib/workspace/owned-private-file.ts','lib/workspace/tenant-context.ts','lib/durable/pg-transport.ts','lib/durable/tenant-pool.ts'])expect(closure.has(file)).toBe(true);
 expect(inventory.has('lib/workspace/tenant-config.ts')).toBe(false);
 for(const required of ['lib/workspace/recovery-capture.ts','lib/workspace/quote-workload-installation.ts','lib/quotes/transaction-context.ts']){expect(closure.has(required)).toBe(true);const omitted=new Set(inventory);omitted.delete(required);expect([...closure].filter(f=>!omitted.has(f))).toEqual([required]);}
 for(const edge of [['lib/connectors/service.ts','lib/connectors/quote-action.ts'],['lib/connectors/quote-action.ts','lib/quotes/transaction-context.ts'],['lib/quotes/transaction-context.ts','lib/durable/contracts.ts'],['lib/quotes/transaction-context.ts','lib/durable/tenant-pool.ts']])expect(edges).toContainEqual(edge);
 expect(await readFile('lib/quotes/transaction-context.ts','utf8')).toContain("from 'node:async_hooks'");
 const measured=await validateConnectorProofSources();expect(Object.keys(measured)).toHaveLength(connectorProofSources.length);for(const value of Object.values(measured))expect(value).toMatch(/^[a-f0-9]{64}$/);
 // The omitted real dependency is detected by the actual closure, not merely by
 // an inventory count. An invented replacement cannot pass filesystem preflight.
 const omitted=new Set(inventory);omitted.delete('lib/workspace/owned-private-file.ts');expect([...closure].filter(file=>!omitted.has(file))).toContain('lib/workspace/owned-private-file.ts');
 await expect(validateConnectorProofSources(process.cwd(),[...connectorProofSources,'lib/workspace/tenant-config.ts'])).rejects.toMatchObject({code:'ENOENT'});
 const producer=ts.createSourceFile('producer',await readFile('scripts/connector-proof.ts','utf8'),ts.ScriptTarget.Latest,true);
 const main=producer.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='main') as ts.FunctionDeclaration;
 const first=main.body!.statements[0];expect(first.getText(producer)).toBe('validateInstalledProofConstruction();');
 expect(main.body!.statements[1].getText(producer)).toContain('await validateConnectorProofSources()');
 expect(main.getText(producer).indexOf('await validateConnectorProofSources()')).toBeLessThan(main.getText(producer).indexOf('await start()'));
},10000);
test('preflight refuses missing, duplicate, escaped and nonregular source paths; refreshed content changes its measured hash',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ll-source-registry-'));
 try{
  await writeFile(join(dir,'source.ts'),'export const version=1;');const before=await validateConnectorProofSources(dir,['source.ts']);
  await writeFile(join(dir,'source.ts'),'export const version=2;');const after=await validateConnectorProofSources(dir,['source.ts']);expect(after['source.ts']).not.toBe(before['source.ts']);
  for(const paths of [[],['source.ts','source.ts'],['../source.ts'],['/source.ts']])await expect(validateConnectorProofSources(dir,paths)).rejects.toThrow();
  await expect(validateConnectorProofSources(dir,['missing.ts'])).rejects.toMatchObject({code:'ENOENT'});
  await expect(validateConnectorProofSources(dir,['.'])).rejects.toThrow();
 }finally{await rm(dir,{recursive:true,force:true});}
});
