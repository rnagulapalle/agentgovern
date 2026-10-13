// Explicit offline follow-up after workspace recovery quarantine; not a runtime API.
import assert from 'node:assert/strict';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {Pool} from 'pg';
import {containRestoredWorkerBuilds} from './restored-worker-containment.mjs';
let db;
try{
 assert(process.env.LOOPLABS_MIGRATION_DATABASE_URL&&process.env.LOOPLABS_RESTORE_ARCHIVE);
 assert.equal(process.env.LOOPLABS_RESTORE_ACK,'WRITERS_STOPPED_AND_EPOCH_ROTATED');
 const digest=createHash('sha256');let header=Buffer.alloc(0),size=0;
 for await(const bytes of createReadStream(process.env.LOOPLABS_RESTORE_ARCHIVE)){
  if(header.length<5)header=Buffer.concat([header,bytes.subarray(0,5-header.length)]);
  size+=bytes.length;assert(Number.isSafeInteger(size));digest.update(bytes);
 }
 assert(size>100&&header.toString()==='PGDMP');
 db=new Pool({connectionString:process.env.LOOPLABS_MIGRATION_DATABASE_URL,max:2,connectionTimeoutMillis:5000});
 const result=await containRestoredWorkerBuilds(db,{orgId:process.env.LOOPLABS_WORKSPACE_ID,epoch:process.env.LOOPLABS_RECOVERY_EPOCH,backupHash:digest.digest('hex')});
 console.log(`Restored worker admission contained: ${result.builds.length} retained builds draining. No reset sent, authority granted or artifact removed.`);
}catch{console.error('Restored worker containment refused; no raw archive, credentials or database error printed.');process.exitCode=1;}
finally{await db?.end();}
