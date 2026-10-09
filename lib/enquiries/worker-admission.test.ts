import {readFile} from "node:fs/promises";
import {randomBytes,randomUUID} from "node:crypto";
import {Pool,type PoolClient} from "pg";
import {beforeAll,afterAll,it,expect} from "vitest";
const suffix=randomBytes(8).toString('hex'),schema=`admission_${suffix}`,role=`admission_role_${suffix}`;
const build=(n:string)=>`ack-${n.repeat(64)}`;
let admin:Pool,db:Pool,runtime:Pool;
async function enroll(n:string){await db.query("INSERT INTO ll_temporal_worker_builds(worker_build_id,image_id,workflow_sha256,service_sha256,lock_sha256) VALUES($1,$2,$3,$3,$3)",[build(n),`sha256:${n.repeat(64)}`,n.repeat(64)]);}
async function insert(c:Pool|PoolClient,n:string){return c.query("INSERT INTO ll_temporal_record_routes(plan_id,worker_build_id) VALUES($1,$2)",[randomUUID(),build(n)]);}
async function blocked(pid:number){
 for(let i=0;i<100;i++){
  if((await db.query("SELECT cardinality(pg_blocking_pids($1))>0 AS blocked",[pid])).rows[0].blocked)return;
  await new Promise(r=>setTimeout(r,10));
 }
 throw Error('Expected actual PostgreSQL lock contention was not observed');
}
beforeAll(async()=>{
 const url=process.env.LOOPLABS_TEST_DATABASE_URL;if(!url)throw Error('Dedicated PostgreSQL required; admission tests must not skip.');
 admin=new Pool({connectionString:url});await admin.query(`CREATE SCHEMA ${schema}`);
 db=new Pool({connectionString:url,options:`-c search_path=${schema}`});
 // Deliberately bounded trigger harness; full application orchestration is not claimed.
 await db.query('CREATE TABLE ll_temporal_record_routes(plan_id uuid PRIMARY KEY,worker_build_id text NOT NULL)');
 await insert(db,'a'); // Pre-migration route must survive without retroactive enrollment.
 await db.query(await readFile('lib/enquiries/worker-admission-schema.sql','utf8'));
 await admin.query(`CREATE ROLE ${role} NOLOGIN`);
 await db.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
 await db.query(`GRANT SELECT,INSERT ON ll_temporal_record_routes TO ${role}`);
 await db.query(`GRANT SELECT ON ll_temporal_worker_builds TO ${role}`);
 runtime=new Pool({connectionString:url,options:`-c search_path=${schema} -c role=${role}`});
});
afterAll(async()=>{await runtime?.end();await db?.end();await admin?.query(`DROP SCHEMA ${schema} CASCADE`);await admin?.query(`DROP OWNED BY ${role}`);await admin?.query(`DROP ROLE ${role}`);await admin?.end();});
it('unknown builds default-deny, enrolled builds admit, drain never rewrites old routes',async()=>{
 const original=(await db.query('SELECT * FROM ll_temporal_record_routes')).rows;
 await expect(insert(runtime,'a')).rejects.toMatchObject({code:'23514'});
 await enroll('b');await insert(runtime,'b');
 await db.query("UPDATE ll_temporal_worker_builds SET state='draining',draining_at=clock_timestamp() WHERE worker_build_id=$1",[build('b')]);
 await expect(insert(runtime,'b')).rejects.toMatchObject({code:'23514'});
 expect((await db.query('SELECT * FROM ll_temporal_record_routes WHERE worker_build_id=$1',[build('a')])).rows).toEqual(original);
 expect((await db.query('SELECT count(*)::int n FROM ll_temporal_record_routes WHERE worker_build_id=$1',[build('b')])).rows[0].n).toBe(1);
});
it('runtime cannot enroll or drain; even owner cannot relabel, reactivate or delete enrollment',async()=>{
 await expect(runtime.query("INSERT INTO ll_temporal_worker_builds(worker_build_id) VALUES($1)",[build('f')])).rejects.toMatchObject({code:'42501'});
 await expect(runtime.query("UPDATE ll_temporal_worker_builds SET state='draining',draining_at=now()")).rejects.toMatchObject({code:'42501'});
 for(const sql of ["UPDATE ll_temporal_worker_builds SET state='active',draining_at=NULL WHERE state='draining'","UPDATE ll_temporal_worker_builds SET image_id='sha256:'||repeat('c',64)","DELETE FROM ll_temporal_worker_builds"])
  await expect(db.query(sql)).rejects.toMatchObject({code:'23514'});
});
it('admitted transaction finishes before drain commits; later transfer refuses',async()=>{
 await enroll('c');const a=await runtime.connect(),b=await db.connect();
 try{
  await a.query('BEGIN');await insert(a,'c');const pid=(await b.query('SELECT pg_backend_pid() pid')).rows[0].pid;
  const drain=b.query("UPDATE ll_temporal_worker_builds SET state='draining',draining_at=now() WHERE worker_build_id=$1",[build('c')]);
  await blocked(pid);expect((await db.query('SELECT state FROM ll_temporal_worker_builds WHERE worker_build_id=$1',[build('c')])).rows[0].state).toBe('active');
  await a.query('COMMIT');await drain;
  await expect(insert(runtime,'c')).rejects.toMatchObject({code:'23514'});
 }finally{await a.query('ROLLBACK');a.release();b.release();}
});
it('drain acquired first blocks concurrent admission, then refuses it after commit',async()=>{
 await enroll('d');const a=await db.connect(),b=await runtime.connect();
 try{
  await a.query('BEGIN');await a.query("UPDATE ll_temporal_worker_builds SET state='draining',draining_at=now() WHERE worker_build_id=$1",[build('d')]);
  const pid=(await b.query('SELECT pg_backend_pid() pid')).rows[0].pid;
  const transfer=insert(b,'d').then(()=>({code:'unexpected_success'}),e=>({code:e.code}));
  await blocked(pid);await a.query('COMMIT');expect(await transfer).toEqual({code:'23514'});
  expect((await db.query('SELECT count(*)::int n FROM ll_temporal_record_routes WHERE worker_build_id=$1',[build('d')])).rows[0].n).toBe(0);
 }finally{await a.query('ROLLBACK');a.release();b.release();}
});
it('temporary-table shadowing cannot fake active admission or invoke the owner function directly',async()=>{
 const c=await runtime.connect();
 try{
  await c.query("CREATE TEMP TABLE ll_temporal_worker_builds(worker_build_id text,state text)");
  await c.query("INSERT INTO pg_temp.ll_temporal_worker_builds VALUES($1,'active')",[build('f')]);
  await expect(insert(c,'f')).rejects.toMatchObject({code:'23514'});
  await expect(c.query(`SELECT ${schema}.ll_record_worker_admission()`)).rejects.toMatchObject({code:'42501'});
 }finally{await c.query('DROP TABLE IF EXISTS pg_temp.ll_temporal_worker_builds');c.release();}
});
