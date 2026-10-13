// Source preparation only. Does not create or promote a discovery receipt.
import {expect,test} from 'vitest';
import ts from 'typescript';
import {readFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {constructInstalledDiscoveryRegistry} from './current-proof-source-registry.mjs';
import {discoveryInstalledSources} from './discovery-installed-evidence.mjs';
const dependencies=['lib/workspace/recovery-capture.ts','lib/workspace/quote-workload-installation.ts','lib/durable/database.ts'];
async function producerInventory(){
 const producer=await readFile('scripts/discovery-browser-proof.mjs','utf8');
 expect(producer).toContain('constructInstalledDiscoveryRegistry as discoveryInstalledConstruction');
 expect(producer).toContain('Object.keys(sourceConstruction().sourceFingerprints)');
 const families=constructInstalledDiscoveryRegistry().families as Record<string,string[]>;
 expect(Array.isArray(families.discovery)).toBe(true);
 expect(families.discovery.every(file=>typeof file==='string')).toBe(true);
 return families.discovery;
}
async function actualInstallerDependency(name:string){
 const file='lib/workspace/tenant-installer.ts',root=process.cwd(),config=ts.readConfigFile(resolve('tsconfig.json'),ts.sys.readFile),options=ts.parseJsonConfigFileContent(config.config,ts.sys,root).options;
 const sf=ts.createSourceFile(file,await readFile(file,'utf8'),ts.ScriptTarget.Latest,true);
 const found=sf.statements.filter(ts.isImportDeclaration).filter(n=>ts.isStringLiteral(n.moduleSpecifier)&&n.moduleSpecifier.text===name);expect(found).toHaveLength(1);
 const resolved=ts.resolveModuleName(name,resolve(file),options,ts.sys).resolvedModule;expect(resolved?.isExternalLibraryImport).toBe(false);expect(resolved).toBeDefined();return relative(root,resolved!.resolvedFileName);
}
async function installerClosure(){
 const root=process.cwd(),config=ts.readConfigFile(resolve('tsconfig.json'),ts.sys.readFile),options=ts.parseJsonConfigFileContent(config.config,ts.sys,root).options,pending=discoveryInstalledSources.filter(f=>/\.(ts|tsx|mjs)$/.test(f)),seen=new Set<string>(),edges:string[][]=[];
 while(pending.length){const f=pending.pop()!;if(seen.has(f))continue;seen.add(f);const sf=ts.createSourceFile(f,await readFile(f,'utf8'),ts.ScriptTarget.Latest,true);
  function visit(n:ts.Node){let name:string|undefined;if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier))name=n.moduleSpecifier.text;if(ts.isCallExpression(n)&&n.arguments.length===1&&ts.isStringLiteral(n.arguments[0])&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||(ts.isIdentifier(n.expression)&&n.expression.text==='require')))name=n.arguments[0].text;if(name){const imported=ts.resolveModuleName(name,resolve(f),options,ts.sys).resolvedModule;if(imported&&!imported.isExternalLibraryImport){const path=relative(root,imported.resolvedFileName);pending.push(path);edges.push([f,path]);}}ts.forEachChild(n,visit);}visit(sf);
 }return {seen,edges};
}
test('current discovery measures its full Next, instrumentation and installer closure without changing the historical v2 inventory',async()=>{
 for(const dependency of dependencies.slice(0,2))expect(await actualInstallerDependency('./'+dependency.split('/').at(-1)!.slice(0,-3))).toBe(dependency);
 const closure=await installerClosure();expect(closure.edges).toContainEqual(['lib/durable/service.ts','lib/durable/database.ts']);
 for(const dependency of [...dependencies,'lib/quotes/transaction-context.ts'])expect(closure.seen.has(dependency)).toBe(true);
 for(const edge of [['lib/connectors/service.ts','lib/connectors/quote-action.ts'],['lib/connectors/quote-action.ts','lib/quotes/transaction-context.ts'],['lib/quotes/native-demo-factory.ts','lib/quotes/transaction-context.ts'],['lib/quotes/transaction-context.ts','lib/durable/contracts.ts'],['lib/quotes/transaction-context.ts','lib/durable/tenant-pool.ts']])expect(closure.edges).toContainEqual(edge);
 const context=await readFile('lib/quotes/transaction-context.ts','utf8');expect(context).toContain("from 'node:async_hooks'");
 const files=await producerInventory();for(const file of [...new Set([...discoveryInstalledSources,...closure.seen])])expect(files).toContain(file);
 for(const file of ['package.json','pnpm-lock.yaml','next.config.mjs','tsconfig.json','lib/quotes/background-schema.sql','lib/quotes/worker-admission-schema.sql','scripts/discovery-installed-evidence.mjs'])expect(files).toContain(file);
});
test('omitting or substituting the actual dependency leaves an unmeasured installer import',async()=>{
 const files=await producerInventory(),closure=await installerClosure();for(const dependency of [...dependencies,'lib/quotes/transaction-context.ts']){const missing=(inventory:string[])=>[...closure.seen].filter(f=>!inventory.includes(f));
 expect(missing(files)).toEqual([]);expect(missing(files.filter(f=>f!==dependency))).toEqual([dependency]);expect(missing([...files.filter(f=>f!==dependency),'lib/workspace/imagined-capture.ts'])).toEqual([dependency]);}
});
