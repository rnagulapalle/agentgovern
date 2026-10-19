// Versioned source construction input only. No receipt, artifact or execution authority.
import assert from 'node:assert/strict';
import {discoveryInstalledSources} from './discovery-installed-source-contract.mjs';
import {createRequire} from 'node:module';
import {readFileSync,existsSync,statSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,dirname,relative,join} from 'node:path';
import {createHash} from 'node:crypto';
export const currentProofRoots=Object.freeze({
 web:['app/api/sales/route.ts','app/contact-sales/page.tsx','app/api/workspace/company/route.ts','app/control-plane/organization/page.tsx','app/control-plane/activity/page.tsx','app/api/workspace/discovery/approvals/route.ts','app/api/workspace/discovery/onboarding/route.ts','app/api/workspace/discovery/activity/route.ts','app/control-plane/page.tsx','app/control-plane/connectors/page.tsx','app/control-plane/[section]/page.tsx','middleware.ts','instrumentation.ts','app/control-plane/layout.tsx','app/control-plane/work/page.tsx','app/control-plane/quotes/page.tsx','app/control-plane/actions/page.tsx','app/control-plane/agents/page.tsx','app/control-plane/workflow-runs/page.tsx','app/control-plane/history/page.tsx','app/api/workspace/agents/route.ts','app/api/durable/route.ts','app/api/workspace/session/route.ts','app/api/workspace/enquiries/route.ts','app/api/workspace/quotes/route.ts','app/api/workspace/quotes/setup/route.ts','app/api/workspace/quotes/verification/route.ts','app/api/durable/connectors/route.ts','app/api/durable/workflows/route.ts','app/api/workspace/discovery/route.ts','app/api/workspace/discovery/owners/route.ts','components/control-plane/enquiry-workspace.tsx','components/control-plane/quote-workspace.tsx','app/control-plane/control-plane.css'],
 ack:['scripts/temporal-service.ts','runtime/temporal/pinned-workflow.ts','scripts/build-temporal-worker.mjs','Dockerfile.temporal','pnpm-lock.yaml'],
 quote:['scripts/temporal-service.ts','runtime/temporal/pinned-quote-workflow.ts','scripts/build-temporal-worker.mjs','Dockerfile.temporal','pnpm-lock.yaml'],
 connector:['scripts/connector-proof.ts','scripts/connector-proof-worker.ts','scripts/workflow-http-proof-server.ts','scripts/workflow-agent.mjs','scripts/connector-twin.py'],
 chat:['scripts/chat-ui-proof.ts','scripts/chat-ui-current-sources.json','scripts/connector-twin.py'],
 load:['scripts/temporal-load-proof.ts','scripts/connector-twin.py'],
 gateway:['scripts/gateway-installed-bypass-proof.mjs','scripts/gateway-installed-controller.ts','scripts/gateway-installed-server.ts','scripts/connector-twin.py'],
 discovery:[...discoveryInstalledSources,'scripts/discovery-installed-source-contract.mjs','scripts/discovery-installed-evidence.mjs'],
 assembly:['scripts/staging-installed-publication.ts','scripts/persistent-installed-owner.ts','scripts/persistent-installed-owner-process.mjs','scripts/persistent-installed-host.mjs','scripts/persistent-installed-database.mjs','scripts/staging-current-image-verifier.mjs','scripts/persistent-installed-runtime-proof.mjs','scripts/persistent-installed-typed-quote-proof.mjs','Dockerfile.staging-provisioner'],
 installedFixture:['lib/durable/tenant-boundary-prototype.test.ts','scripts/tenant-route-process.ts','lib/durable/test-fixtures/tenant-base-table-inventory.json'],
 providers:['scripts/staging-native-policy-ready.mjs','scripts/check-quote-email-health.py','scripts/native-quote-twin.ts','scripts/native-quote-twin-process.ts','scripts/connector-twin.py','scripts/connector-twin-tls.py','Dockerfile.connector-twin'],
 recovery:['scripts/workspace-restore-proof.ts','lib/durable/recovery.ts','lib/workspace/recovery-capture.ts','lib/workspace/quote-recovery-inventory.ts','lib/workspace/tenant-bootstrap.ts'],
});
const externalAssets=['lib/workspace/cloud-business-metadata-schema.sql','scripts/cloud-runtime-metadata-upgrade-process.ts','scripts/cloud-runtime-metadata-setup.ts','lib/workspace/cloud-runtime-metadata-schema.sql','scripts/company-directory-upgrade-process.ts','scripts/company-directory-setup.ts','lib/workspace/company-profile-schema.sql','scripts/current-proof-source-registry.mjs','package.json','pnpm-lock.yaml','tsconfig.json','next.config.mjs','lib/durable/tenant-boundary-prototype-schema.sql','lib/workspace/membership-authority-schema.sql','lib/connectors/quote-action-schema.sql','lib/quotes/background-schema.sql','lib/quotes/worker-admission-schema.sql'];
export function constructCurrentProofRegistry(root=process.cwd(),roots=currentProofRoots){
 const dir=realpathSync(resolve(root)),ts=createRequire(join(dir,'package.json'))('typescript'),seen=new Set(),edges=[],directories=[],missing=[],parsedImports=new Map();
 function ownedSource(path){const actual=realpathSync(path);assert.equal(actual,path,'Source symlink or ancestry refused');assert(!relative(dir,actual).startsWith('../'),'Source escapes root');assert(lstatSync(path).isFile()&&!lstatSync(path).isSymbolicLink(),'Regular current source required');}
 function locate(from,name,allowDirectory=false){if(!(name.startsWith('.')||name.startsWith('@/')))return null;const base=name.startsWith('@/')?join(dir,name.slice(2)):resolve(dir,dirname(from),name);if(allowDirectory&&existsSync(base)&&statSync(base).isDirectory()){assert.equal(realpathSync(base),base,'Source symlink or ancestry refused');assert(!relative(dir,base).startsWith('../'),'Source directory escapes root');directories.push({from,directory:relative(dir,base)||'.'});return null;}for(const candidate of [base,base+'.ts',base+'.tsx',base+'.mjs',base+'.js',join(base,'index.ts'),join(base,'index.tsx')])if(existsSync(candidate)&&statSync(candidate).isFile()){ownedSource(candidate);const file=relative(dir,candidate);assert(!file.startsWith('../'),'Source escapes root');return file;}missing.push({from,name});return null;}
 function walk(file){if(seen.has(file))return;if(!existsSync(join(dir,file))){missing.push({entry:file});return;}ownedSource(join(dir,file));seen.add(file);if(!/\.(?:tsx?|m?js)$/.test(file))return;// Parse once per invocation, never across calls. Each family still traverses
 // every edge and rechecks owned paths; later calls observe changed imports.
 let imports=parsedImports.get(file);
 if(!imports){imports=[];const source=ts.createSourceFile(file,readFileSync(join(dir,file),'utf8'),ts.ScriptTarget.Latest,true);
 function visit(n){let name,allowDirectory=false;if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier))name=n.moduleSpecifier.text;
 if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(n.expression)&&n.expression.text==='require')&&n.arguments.length===1&&ts.isStringLiteral(n.arguments[0]))name=n.arguments[0].text;
 if(ts.isNewExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='URL'&&n.arguments?.length===2&&ts.isStringLiteral(n.arguments[0])){name=n.arguments[0].text;allowDirectory=true;}
 if(name)imports.push({name,allowDirectory});ts.forEachChild(n,visit);}visit(source);parsedImports.set(file,imports);}
 for(const {name,allowDirectory}of imports){const target=locate(file,name,allowDirectory);if(target){edges.push({from:file,to:target});walk(target);}}}
 const families={};for(const [family,entries]of Object.entries(roots)){seen.clear();for(const f of entries)walk(f);for(const f of externalAssets)walk(f);families[family]=[...seen].sort();}
 assert.equal(missing.length,0,'Current dependency closure incomplete '+JSON.stringify(missing));const files=[...new Set(Object.values(families).flat())].sort();
 return {contract:'installed-platform-proof-source-1',families,edges,directories,nonAstAssets:externalAssets,sourceFingerprints:Object.fromEntries(files.map(f=>[f,createHash('sha256').update(readFileSync(join(dir,f))).digest('hex')]))};
}
export function validateCurrentProofRegistry(expected,root=process.cwd()){
 assert.equal(expected.contract,'installed-platform-proof-source-1');assert.deepEqual(Object.keys(expected).sort(),['contract','families','edges','directories','nonAstAssets','sourceFingerprints'].sort());assert.deepEqual(constructCurrentProofRegistry(root),expected,'Source omission, addition, transitive edge or byte drift');return true;
}

export function validateInstalledProofConstruction(root=process.cwd()){
 const bytes=readFileSync(join(root,'scripts/current-installed-proof-sources.json'));assert(bytes.length>0&&bytes.length<=1048576,'Bounded current construction registry required');
 return validateCurrentProofRegistry(JSON.parse(bytes.toString('utf8')),root);
}

export function constructInstalledDiscoveryRegistry(root=process.cwd()){return constructCurrentProofRegistry(root,{discovery:currentProofRoots.discovery});}
