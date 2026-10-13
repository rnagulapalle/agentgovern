import {expect,it} from 'vitest';
import {fixtureEnvironment,spawnObserved,verifyBackend,fixtureInterpreter,verifyOwnedPythonPrerequisites,PythonFixturePrerequisiteError} from './owned-python-fixture';
import {mkdtempSync,rmSync,writeFileSync,symlinkSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
it('does not forward ambient credentials or interpreter injection',()=>{
 const previous=process.env.AWS_SECRET_ACCESS_KEY,python=process.env.PYTHONPATH;
 process.env.AWS_SECRET_ACCESS_KEY='unit-only-secret';process.env.PYTHONPATH='/unit-injection';
 try{const env=fixtureEnvironment('/fixture/backend','/fixture/state');expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();expect(env.PYTHONPATH).toBeUndefined();expect(Object.keys(env).sort()).toEqual(['AWS_EC2_METADATA_DISABLED','FETCHSANDBOX_BACKEND_PATH','HOME','LOOPLABS_CONNECTOR_STATE_DIR','NODE_ENV','PATH','PYTHONDONTWRITEBYTECODE','PYTHONNOUSERSITE'].sort());}finally{if(previous===undefined)delete process.env.AWS_SECRET_ACCESS_KEY;else process.env.AWS_SECRET_ACCESS_KEY=previous;if(python===undefined)delete process.env.PYTHONPATH;else process.env.PYTHONPATH=python;}
});
it('records missing executable before PID/readiness observation without unhandled error',async()=>{
 await expect(spawnObserved('/nonexistent-looplabs-owned-python',[],{PATH:process.env.PATH,NODE_ENV:'test'})).rejects.toThrow('Owned Python fixture process failed to spawn');
});
it('returns only a real spawned child and observes its terminal exit',async()=>{
 const child=await spawnObserved(process.execPath,['-e','setTimeout(()=>process.exit(0),30)'],{PATH:process.env.PATH,NODE_ENV:'test'});expect(child.pid).toBeGreaterThan(0);if(child.exitCode===null)await once(child,'exit');expect(child.exitCode).toBe(0);
});
it('rejects a fabricated backend rather than treating presence as source proof',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ll-python-negative-'));try{writeFileSync(join(dir,'fake.py'),'# not a provider');expect(()=>verifyBackend(dir,dir)).toThrow();}finally{rmSync(dir,{recursive:true});}
});

it('preserves the selected executable symlink invocation instead of changing interpreter context',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ll-interpreter-'));try{const selected=join(dir,'python');symlinkSync(process.execPath,selected);expect(fixtureInterpreter(selected)).toEqual({invocation:selected,target:realpathSync(process.execPath)});}finally{rmSync(dir,{recursive:true});}
});
it('reports only a bounded missing-backend phase without raw source paths',()=>{
 const old=process.env.FETCHSANDBOX_BACKEND_PATH;process.env.FETCHSANDBOX_BACKEND_PATH='/missing-unit-backend';try{let error:unknown;try{verifyOwnedPythonPrerequisites('/unit-state');}catch(e){error=e;}expect(error).toBeInstanceOf(PythonFixturePrerequisiteError);expect(error).toMatchObject({phase:'backend-path',message:'Owned Python fixture prerequisite refused: backend-path'});expect(String(error)).not.toContain('/missing-unit-backend');}finally{if(old===undefined)delete process.env.FETCHSANDBOX_BACKEND_PATH;else process.env.FETCHSANDBOX_BACKEND_PATH=old;}
});
