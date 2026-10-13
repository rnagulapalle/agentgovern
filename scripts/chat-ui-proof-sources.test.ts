import {expect,test} from 'vitest';
import ts from 'typescript';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve,relative,join} from 'node:path';
import {tmpdir} from 'node:os';
import {validateChatProofSources} from './chat-ui-proof-sources';
test('actual static and literal dynamic startup/browser/workload closure is measured before fixture or effects',async()=>{
 const root=process.cwd(),inventory=JSON.parse(await readFile('scripts/chat-ui-current-sources.json','utf8'));
 const cfg=ts.readConfigFile(resolve('tsconfig.json'),ts.sys.readFile),options=ts.parseJsonConfigFileContent(cfg.config,ts.sys,root).options;
 const pending:string[]=[...inventory.roots],seen=new Set<string>(),edges:string[][]=[];
 while(pending.length){const f=pending.pop()!;if(seen.has(f))continue;seen.add(f);const sf=ts.createSourceFile(f,await readFile(f,'utf8'),ts.ScriptTarget.Latest,true);
  function visit(n:ts.Node){let name:string|undefined;
   if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier))name=n.moduleSpecifier.text;
   if(ts.isCallExpression(n)&&n.arguments.length===1&&ts.isStringLiteral(n.arguments[0])&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||(ts.isIdentifier(n.expression)&&n.expression.text==='require')))name=n.arguments[0].text;
   if(name){const imported=ts.resolveModuleName(name,resolve(f),options,ts.sys).resolvedModule;if(imported&&!imported.isExternalLibraryImport){const path=relative(root,imported.resolvedFileName);pending.push(path);edges.push([f,path]);}}ts.forEachChild(n,visit);
  }visit(sf);
 }
 for(const f of seen)expect(inventory.files,`Unmeasured actual dependency: ${f}`).toContain(f);
 expect([...inventory.files].sort()).toEqual([...seen,'app/control-plane/control-plane.css','app/globals.css','app/sales.css','scripts/connector-twin.py'].sort());
 for(const f of ['instrumentation.ts','lib/workspace/owned-private-file.ts','lib/durable/workload-pool.ts','lib/durable/pg-transport.ts','lib/enquiries/revision.ts'])expect(seen.has(f)).toBe(true);
 for(const f of JSON.parse(await readFile('install-order.json','utf8')))expect(inventory.files).toContain(f);
 const omitted=inventory.files.filter((f:string)=>f!=='lib/workspace/owned-private-file.ts');expect([...seen].filter(f=>!omitted.includes(f))).toContain('lib/workspace/owned-private-file.ts');
 expect(seen.has('lib/workspace/recovery-capture.ts')).toBe(true);const recoveryOmitted=inventory.files.filter((f:string)=>f!=='lib/workspace/recovery-capture.ts');expect([...seen].filter(f=>!recoveryOmitted.includes(f))).toEqual(['lib/workspace/recovery-capture.ts']);
 for(const edge of [['lib/connectors/service.ts','lib/connectors/quote-action.ts'],['lib/connectors/quote-action.ts','lib/quotes/transaction-context.ts'],['lib/quotes/native-demo-factory.ts','lib/quotes/transaction-context.ts'],['lib/quotes/worker-native-controls.ts','lib/quotes/transaction-context.ts'],['lib/quotes/transaction-context.ts','lib/durable/contracts.ts'],['lib/quotes/transaction-context.ts','lib/durable/tenant-pool.ts']])expect(edges).toContainEqual(edge);
 const transactionOmitted=inventory.files.filter((f:string)=>f!=='lib/quotes/transaction-context.ts');expect([...seen].filter(f=>!transactionOmitted.includes(f))).toEqual(['lib/quotes/transaction-context.ts']);
 expect(await readFile('lib/quotes/transaction-context.ts','utf8')).toContain("from 'node:async_hooks'");
 const hashes=await validateChatProofSources();expect(Object.keys(hashes)).toHaveLength(inventory.files.length+1);
 const sf=ts.createSourceFile('producer',await readFile('scripts/chat-ui-proof.ts','utf8'),ts.ScriptTarget.Latest,true);
 const main=sf.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='main') as ts.FunctionDeclaration;
 expect(main.body!.statements[0].getText(sf)).toBe('validateInstalledProofConstruction();');
 expect(main.body!.statements[1].getText(sf)).toContain('await validateChatProofSources()');
 const body=main.getText(sf);expect(body).not.toContain('await writeFile("docs/evidence/chat-ui-proof.json"');
 const finalStatement=main.body!.statements.at(-1)!;expect(finalStatement.getText(sf)).toContain('flag:"wx"');
 const cleanup=main.body!.statements.find(n=>ts.isTryStatement(n)) as ts.TryStatement;
 expect(cleanup.finallyBlock!.getText(sf)).toContain('pg_roles');expect(cleanup.finallyBlock!.getText(sf)).toContain('pg_namespace');
 expect(main.body!.statements.indexOf(cleanup)).toBeLessThan(main.body!.statements.length-1);
},10000);
test('malformed, missing, duplicate and escaped inventories refuse; real source drift changes measured identity',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ll-chat-source-'));try{
  const {mkdir}=await import('node:fs/promises');await mkdir(join(dir,'scripts'));
  const file=join(dir,'scripts/chat-ui-current-sources.json'),valid={contract:'installed-chat-source-inventory-2',roots:['a.ts'],files:['a.ts']};
  await writeFile(join(dir,'a.ts'),'export const v=1;');await writeFile(file,JSON.stringify(valid));const before=await validateChatProofSources(dir);
  await writeFile(join(dir,'a.ts'),'export const v=2;');expect((await validateChatProofSources(dir))['a.ts']).not.toBe(before['a.ts']);
  for(const value of [null,{}, {...valid,extra:true},{...valid,roots:['absent.ts']},{...valid,files:['a.ts','a.ts']},{...valid,roots:['../a.ts'],files:['../a.ts']}]){await writeFile(file,JSON.stringify(value));await expect(validateChatProofSources(dir)).rejects.toThrow();}
  await writeFile(file,JSON.stringify({...valid,roots:['missing.ts'],files:['missing.ts']}));await expect(validateChatProofSources(dir)).rejects.toMatchObject({code:'ENOENT'});
 }finally{await rm(dir,{recursive:true,force:true});}
});
