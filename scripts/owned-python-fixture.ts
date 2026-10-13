// Test-only transport fixture startup. Never imported by application runtime.
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { readFileSync, realpathSync, lstatSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const commit='08372aadbaa6fb8f37368c6900323b8619c10f2c';
const specHash='b99cb45c4944838cc000ab0a9ee08f129cb87f3bf3c202a3d3d18b940aead47c';
const roots=['app','configs/hubspot','configs/resend','specs/resend'];
const app=resolve(fileURLToPath(new URL('..',import.meta.url)));
export function fixtureEnvironment(backend:string,state:string):NodeJS.ProcessEnv {
 return {PATH:process.env.PATH,HOME:homedir(),NODE_ENV:'test',FETCHSANDBOX_BACKEND_PATH:backend,LOOPLABS_CONNECTOR_STATE_DIR:state,PYTHONNOUSERSITE:'1',PYTHONDONTWRITEBYTECODE:'1',AWS_EC2_METADATA_DISABLED:'true'};
}
export function verifyBackend(repository:string,backend:string){
 const env:NodeJS.ProcessEnv={PATH:process.env.PATH,HOME:homedir(),NODE_ENV:'test'};
 const tree=execFileSync('git',['-C',repository,'ls-tree','-rz',commit,'--',...roots.map(p=>'backend/'+p)],{env,encoding:'utf8',timeout:10000,maxBuffer:4*1024*1024,stdio:['ignore','pipe','pipe']});
 const expected=new Map<string,string>();
 for(const entry of tree.split('\0').filter(Boolean)){
  const m=/^(100644|100755) blob ([a-f0-9]{40})\tbackend\/(.+)$/.exec(entry);if(!m)throw Error('Reviewed fixture source mode refused');expected.set(m[3],m[2]);
 }
 if(expected.size!==261)throw Error('Reviewed fixture source inventory differs');
 const found=new Set<string>();
 function visit(relative:string){const path=join(backend,relative),st=lstatSync(path);if(st.isDirectory()){for(const name of readdirSync(path))visit(relative+'/'+name);return;}if(!st.isFile())throw Error('Fixture source link or special file refused');const bytes=readFileSync(path),hash=createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');if(expected.get(relative)!==hash)throw Error('Reviewed fixture source bytes differ');found.add(relative);}
 for(const root of roots)visit(root);
 if(found.size!==expected.size)throw Error('Reviewed fixture source incomplete');
 const spec=join(backend,'specs/hubspot/openapi.yaml');if(!lstatSync(join(backend,'specs/hubspot')).isDirectory()||!lstatSync(spec).isFile()||createHash('sha256').update(readFileSync(spec)).digest('hex')!==specHash)throw Error('Reviewed fixture specification differs');
}
export type PythonPrerequisitePhase='backend-path'|'interpreter-path'|'source-verification'|'dependencies';
export class PythonFixturePrerequisiteError extends Error {
 constructor(readonly phase:PythonPrerequisitePhase){super('Owned Python fixture prerequisite refused: '+phase);this.name='PythonFixturePrerequisiteError';}
}
// Keep the invocation path: CPython discovers a venv from argv's executable path.
// realpath is validation of the executable target, never substitution of argv[0].
export function fixtureInterpreter(selected:string){
 const invocation=resolve(selected),target=realpathSync(invocation);
 if(!lstatSync(target).isFile())throw Error('Interpreter unavailable');
 return {invocation,target};
}
export function verifyOwnedPythonPrerequisites(state:string){
 let phase:PythonPrerequisitePhase='backend-path';
 try{
  const backend=realpathSync(process.env.FETCHSANDBOX_BACKEND_PATH??join(homedir(),'sandbox/backend'));
  phase='interpreter-path';
  const python=fixtureInterpreter(process.env.LOOPLABS_TEST_PYTHON??join(backend,'.venv/bin/python'));
  phase='source-verification';
  verifyBackend(process.env.LOOPLABS_TEST_FIXTURE_REPOSITORY??join(homedir(),'sandbox'),backend);
  phase='dependencies';
  execFileSync(python.invocation,[join(app,'scripts/check-twin-dependencies.py'),join(app,'scripts/connector-twin-requirements.txt')],{env:fixtureEnvironment(backend,state),timeout:15000,stdio:['ignore','ignore','pipe']});
  if(realpathSync(python.invocation)!==python.target||!lstatSync(python.target).isFile())throw Error('Interpreter changed');
  return {backend,python:python.invocation};
 }catch{throw new PythonFixturePrerequisiteError(phase);}
}
export async function spawnOwnedPythonFixture(args:string[],state:string):Promise<ChildProcess>{
 const {backend,python}=verifyOwnedPythonPrerequisites(state);
 return spawnObserved(python,args,fixtureEnvironment(backend,state));
}
// Attach error bookkeeping synchronously, before any PID/metadata/readiness observation.
export function spawnObserved(executable:string,args:string[],env:NodeJS.ProcessEnv):Promise<ChildProcess>{
 return new Promise((resolveChild,reject)=>{
  const child=spawn(executable,args,{env,stdio:['ignore','ignore','ignore']});
  child.on('error',()=>reject(Error('Owned Python fixture process failed to spawn')));
  child.once('spawn',()=>{if(!child.pid||child.pid===process.pid){reject(Error('Owned child identity refused'));return;}resolveChild(child);});
 });
}
