// CI prerequisites only. Restored artifacts retain their original provenance;
// preparing them does not establish a new browser, provider or release proof.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,mkdir,readdir,lstat,copyFile,realpath} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function validateFixtureManifest(value){
 assert.deepEqual(Object.keys(value).sort(),['bucket','contract','files','inventorySha256','key','providerCommit','region','sha256']);
 assert.equal(value.contract,'private-quality-fixtures-1');
 assert.equal(value.region,'us-west-2');
 assert.equal(value.bucket,'looplabs-m7-code-962639302232-f08cb8f0');
 for(const key of ['sha256','inventorySha256'])assert(/^[a-f0-9]{64}$/.test(value[key]));
 assert.equal(value.key,'quality-fixtures/'+value.sha256+'.tar.gz');
 assert.equal(value.providerCommit,'08372aadbaa6fb8f37368c6900323b8619c10f2c');
 assert(Number.isInteger(value.files)&&value.files>261);
 return value;
}
export function validateArchiveListing(names,types){
 const rows=names.trim().split('\n'),details=types.trim().split('\n');
 assert.equal(rows.length,details.length);assert(rows.length>1);
 for(let i=0;i<rows.length;i++){
  const path=rows[i].replace(/\/$/,'');
  assert(path==='fixtures'||path.startsWith('fixtures/'));
  assert(!path.split('/').some(p=>!p||p==='.'||p==='..'));
  assert(/^[a-zA-Z0-9_./-]+$/.test(path));
  assert(['-','d'].includes(details[i][0]),'Linked or special fixture member refused');
 }
 assert.equal(new Set(rows).size,rows.length);
}
export async function verifyFixtureInventory(root,manifest){
 const bytes=await readFile(join(root,'inventory.json'));
 assert.equal(sha(bytes),manifest.inventorySha256,'Fixture inventory changed');
 const inventory=JSON.parse(bytes);
 assert.deepEqual(Object.keys(inventory).sort(),['contract','files','providerCommit']);
 assert.equal(inventory.contract,manifest.contract);assert.equal(inventory.providerCommit,manifest.providerCommit);
 assert.equal(Object.keys(inventory.files).length,manifest.files);
 const found=[];
 async function visit(relative=''){
  for(const name of await readdir(join(root,relative))){
   const path=relative?relative+'/'+name:name,full=join(root,path),st=await lstat(full);
   assert(!st.isSymbolicLink(),'Fixture link refused');
   if(st.isDirectory())await visit(path);
   else {assert(st.isFile()&&st.nlink===1);if(path==='inventory.json')continue;
    assert(/^[a-f0-9]{64}$/.test(inventory.files[path]??''),'Unlisted fixture file');
    assert.equal(sha(await readFile(full)),inventory.files[path],'Fixture bytes changed');found.push(path);
   }
  }
 }
 await visit();assert.deepEqual(found.sort(),Object.keys(inventory.files).sort());
 return inventory;
}
export async function prepareQualityFixtures(archiveArg,outputArg,appArg=process.cwd()){
 const app=await realpath(appArg),archive=await realpath(archiveArg),output=resolve(outputArg);
 assert(!output.includes('\n'));await mkdir(output,{mode:0o700});
 const manifest=validateFixtureManifest(JSON.parse(await readFile(join(app,'scripts/quality-fixture-manifest.json'))));
 assert.equal(sha(await readFile(archive)),manifest.sha256,'Private fixture archive changed');
 const tar=args=>execFileSync('tar',args,{encoding:'utf8',maxBuffer:16777216,stdio:['ignore','pipe','pipe']});
 validateArchiveListing(tar(['-tzf',archive]),tar(['-tvzf',archive]));
 tar(['-xzf',archive,'--no-same-owner','-C',output]);
 const root=join(output,'fixtures');await verifyFixtureInventory(root,manifest);
 // These are exact previously measured bytes, never a synthetic stand-in or a
 // newly generated build asserted to match a historical browser receipt.
 const receipt=JSON.parse(await readFile(join(app,'docs/evidence/discovery-installed-browser-v3-20261014-observation-checkpoint-proof.json')));
 for(const [path,expected]of Object.entries(receipt.compiledArtifacts)){
  assert(/^\.next\/server\/app\/(?:api\/workspace\/discovery\/(?:owners\/)?route|control-plane\/discovery\/page)\.js$/.test(path));
  const source=join(root,'measured-discovery',path);assert.equal(sha(await readFile(source)),expected);
  const target=join(app,path);await mkdir(dirname(target),{recursive:true});await copyFile(source,target);
 }
 const environment={FETCHSANDBOX_BACKEND_PATH:join(root,'provider/backend'),LOOPLABS_TEST_FIXTURE_REPOSITORY:join(root,'provider'),LOOPLABS_TEST_PYTHON:join(root,'provider/backend/.venv/bin/python'),LOOPLABS_CHAT_COMPILED_DIRECTORY:join(root,'authenticated-chat/profiles'),LOOPLABS_CHAT_COMPILED_ZIP:join(root,'authenticated-chat/compiled.zip'),LOOPLABS_CHAT_COMPILED_INTAKE:join(root,'authenticated-chat/intake.json'),LOOPLABS_CHAT_ORIGINAL_COMPONENT:join(root,'authenticated-chat/component.json')};
 return {environment,manifest,root};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{
  assert.equal(process.argv.length,4);
  const {environment,manifest}=await prepareQualityFixtures(process.argv[2],process.argv[3]);
  const {appendFile}=await import('node:fs/promises');assert(process.env.GITHUB_ENV);
  await appendFile(process.env.GITHUB_ENV,Object.entries(environment).map(([key,value])=>key+'='+value).join('\n')+'\n'+['AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN'].map(key=>key+'=').join('\n')+'\n');
  console.log('Authenticated CI prerequisites restored: '+manifest.files+' files. No new application proof claimed.');
 }catch{console.error('Private CI prerequisite preparation refused; full quality has not run.');process.exitCode=1;}
}
