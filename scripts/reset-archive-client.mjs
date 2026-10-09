// Test-only scoped PostgreSQL custom archive client; no full-database restore.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
export function scopedArchiveClient(url,schema){
 assert(/^reset_archive_[a-f0-9]{16}$/.test(schema));
 const pg=new URL(url);assert(['postgres:','postgresql:'].includes(pg.protocol));
 const env={...process.env,PGHOST:pg.hostname,PGPORT:pg.port||'5432',PGUSER:decodeURIComponent(pg.username),PGPASSWORD:decodeURIComponent(pg.password),PGDATABASE:decodeURIComponent(pg.pathname.slice(1))};
 const container=process.env.LOOPLABS_TEST_POSTGRES_CONTAINER;
 let prefix=[];
 if(container){
  assert.equal(process.env.GITHUB_ACTIONS,'true','Explicit GitHub test service only');assert(/^[a-f0-9]{64}$/.test(container));
  assert.equal(pg.hostname,'127.0.0.1');
  const observed=JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']}))[0];
  assert.equal(observed.Id,container);assert.equal(observed.State.Running,true);assert.equal(observed.Config.Image,'postgres:17');
  assert(observed.HostConfig.PortBindings?.['5432/tcp']?.some(p=>p.HostPort===env.PGPORT));
  prefix=['exec','-i','--env','PGPASSWORD',container];
 }
 function run(command,args,input){
  const target=container?'docker':command;
  const argv=container?[...prefix,command,'-h','127.0.0.1','-p','5432','-U',env.PGUSER,...args]:args;
  return execFileSync(target,argv,{env,input,timeout:30000,maxBuffer:8*1024**2,stdio:['pipe','pipe','pipe']});
 }
 return {
  dump(){const archive=run('pg_dump',['--dbname',env.PGDATABASE,'--format=custom','--no-owner','--no-acl',`--schema=${schema}`]);assert(archive.length>100&&archive.subarray(0,5).toString()==='PGDMP');return archive;},
  restore(archive){assert(Buffer.isBuffer(archive)&&archive.length>100&&archive.length<=8*1024**2&&archive.subarray(0,5).toString()==='PGDMP');run('pg_restore',['--dbname',env.PGDATABASE,'--clean','--if-exists','--single-transaction','--no-owner','--no-acl',`--schema=${schema}`],archive);},
 };
}
