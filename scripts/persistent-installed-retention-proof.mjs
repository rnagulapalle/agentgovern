// Genuine isolated verified-TLS database component. Not full runtime/deployment.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {withOwnedInstalledStagingFixture,waitForOwnedSessionDrain} from './staging-owned-installed-fixture.mjs';
import {bootstrapInstalledAssemblyDatabase,readPersistentMembers} from './staging-installed-database-bootstrap.ts';
import {passwordHash} from '../lib/workspace/auth.ts';
const result=await withOwnedInstalledStagingFixture(async f=>{
 const inventory=async()=>({roles:(await f.admin.query('SELECT oid::text oid,rolname FROM pg_roles ORDER BY oid')).rows,schemas:(await f.admin.query('SELECT oid::text oid,nspname FROM pg_namespace ORDER BY oid')).rows});const before=await inventory();
 const members=[{email:'requester@synthetic.example',name:'Synthetic Requester',passwordHash:passwordHash('synthetic-password-one')},{email:'reviewer@synthetic.example',name:'Synthetic Reviewer',passwordHash:passwordHash('synthetic-password-two')}];
 const inputFile=join(f.directory,'members.json');await writeFile(inputFile,JSON.stringify(members),{mode:0o600});const read=await readPersistentMembers(inputFile);assert.deepEqual(read.members,members);
 const disposableDir=join(f.directory,'disposable-child');await mkdir(disposableDir,{mode:0o700});const disposable=await bootstrapInstalledAssemblyDatabase({url:f.url,transport:f.transport,directory:disposableDir});assert.equal(disposable.accounts.length,2);await disposable.close();assert.deepEqual(await inventory(),before);
 const retainedDir=join(f.directory,'retained-child');await mkdir(retainedDir,{mode:0o700});let installed;
 try{
  installed=await bootstrapInstalledAssemblyDatabase({url:f.url,transport:f.transport,directory:retainedDir,retention:'retain-owned-installation',members:read.members});assert.equal(installed.accounts.length,0);const schema=installed.schema;
  const rows=async()=>(await f.admin.query(`SELECT email,name,password_hash,active FROM ${schema}.ll_members ORDER BY email`)).rows;const expected=members.map(m=>({email:m.email,name:m.name,password_hash:m.passwordHash,active:true})).sort((a,b)=>a.email.localeCompare(b.email));assert.deepEqual(await rows(),expected);
  const schemaOid=(await f.admin.query('SELECT oid::text oid FROM pg_namespace WHERE nspname=$1',[schema])).rows[0].oid,installedInventory=await inventory();await assert.rejects(installed.close(),/Retained installation/);assert.deepEqual(await inventory(),installedInventory);
  await installed.disconnect();await installed.disconnect();await waitForOwnedSessionDrain(f.admin,Object.keys(installed.roles));assert.deepEqual(await rows(),expected);assert.deepEqual(await inventory(),installedInventory);
  await f.restartDatabase();assert.equal((await f.admin.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0].ssl,true);assert.equal((await f.admin.query('SELECT oid::text oid FROM pg_namespace WHERE nspname=$1',[schema])).rows[0].oid,schemaOid);assert.deepEqual(await rows(),expected);assert.deepEqual(await inventory(),installedInventory);
  await assert.rejects(bootstrapInstalledAssemblyDatabase({url:f.url,transport:f.transport,directory:retainedDir,retention:'retain-owned-installation',members:read.members}));assert.deepEqual(await inventory(),installedInventory);assert.deepEqual(await rows(),expected);assert.equal(JSON.parse(await readFile(join(retainedDir,'retained-installation-intent.json'),'utf8')).prepared,false);
  return {scope:'isolated retained installed SQL generation/hash import + database restart',checks:10,verifiedTls:true,defaultDestructiveCleanup:true,retainedCloseRefused:true,disconnectPreserved:true,repeatedPreparationRefused:true,actualDatabaseRestart:true,fullRuntimeRestart:false,releaseAccepted:false,productionActivated:false};
 }finally{if(installed){await installed.disconnect();await waitForOwnedSessionDrain(f.admin,Object.keys(installed.roles));for(const [role,oid]of Object.entries(installed.roles)){assert.equal((await f.admin.query('SELECT oid::text oid FROM pg_roles WHERE rolname=$1',[role])).rows[0]?.oid,oid);await f.admin.query('DROP OWNED BY '+role);await f.admin.query('DROP ROLE '+role);}await f.admin.query('DROP SCHEMA '+installed.schema+' CASCADE');assert.deepEqual(await inventory(),before);}}
});
await writeFile(process.env.LOOPLABS_RETENTION_COMPONENT_RESULT,JSON.stringify(result,null,2)+'\n',{mode:0o600,flag:'wx'});
