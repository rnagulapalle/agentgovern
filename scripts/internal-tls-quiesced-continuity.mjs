// Read-only observation of the retained connector while its health writer is stopped.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {authority} from './control-demo-web-release.mjs';
const project='ll-platform-27ec7699f577';
export const quiescedConnectorInventory=Object.freeze(['ps','-aq','--no-trunc','--filter','label=com.docker.compose.project='+project,'--filter','label=com.docker.compose.service=connector-twin']);
export function assertSingleFullConnectorId(id){assert(/^[a-f0-9]{64}$/.test(id),'One full connector identity required');return id;}
export const quiescedStatePython=`import pathlib,hashlib,json,os,stat,sys
root=pathlib.Path(sys.argv[1]); assert root.is_dir() and not root.is_symlink()
files=sorted(root.rglob('*')); assert len(files)<=10000
out={}
for f in files:
 s=f.lstat(); assert not stat.S_ISLNK(s.st_mode)
 if stat.S_ISDIR(s.st_mode): continue
 assert stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_size<=67108864
 fd=os.open(f,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  a=os.fstat(fd); fields=lambda x:(x.st_dev,x.st_ino,x.st_uid,x.st_mode,x.st_nlink,x.st_size,x.st_mtime_ns,x.st_ctime_ns)
  assert fields(a)==fields(s)
  h=hashlib.sha256(); size=0
  while size<=a.st_size:
   b=os.read(fd,min(1048576,a.st_size+1-size))
   if not b: break
   size+=len(b); h.update(b)
  assert size==a.st_size and fields(a)==fields(os.fstat(fd)) and fields(a)==fields(f.lstat())
  out[str(f.relative_to(root))]=h.hexdigest()
 finally: os.close(fd)
assert out
print(json.dumps(out,sort_keys=True))`;
export function quiescedConnectorRunArguments(c){
 assert(c?.Config?.Labels?.['com.docker.compose.project']===project&&c.Config.Labels['com.docker.compose.service']==='connector-twin');
 assert(/^[a-f0-9]{64}$/.test(c.Id)&&/^sha256:[a-f0-9]{64}$/.test(c.Image));
 assert(c.State?.Running===false&&c.State.Paused===false,'Connector must be stopped, not paused');
 const mounts=c.Mounts.filter(m=>m.Destination==='/state');assert(mounts.length===1);const m=mounts[0];assert(m.RW===true);
 let mount;if(m.Type==='volume'){assert(/^[A-Za-z0-9_.-]+$/.test(m.Name)&&m.Name.startsWith(project+'_'));mount='type=volume,src='+m.Name+',dst=/state,readonly';}
 else{assert(m.Type==='bind'&&typeof m.Source==='string'&&m.Source.startsWith(authority+'/installation/')&&!m.Source.includes(',')&&!m.Source.includes('\0')&&!m.Source.split('/').includes('..'));mount='type=bind,src='+m.Source+',dst=/state,readonly';}
 const user=c.Config.User||'0:0';assert(/^[0-9]+(?::[0-9]+)?$/.test(user));
 return ['run','--rm','--pull','never','--read-only','--network','none','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','32','--memory','128m','--cpus','0.5','--user',user,'--mount',mount,'--entrypoint','python3',c.Image,'-c',quiescedStatePython,'/state'];
}
export function assertSameStoppedConnector(before,after){quiescedConnectorRunArguments(before);quiescedConnectorRunArguments(after);assert.deepEqual({id:after.Id,image:after.Image,mounts:after.Mounts,user:after.Config.User},{id:before.Id,image:before.Image,mounts:before.Mounts,user:before.Config.User},'Observed connector identity or mount changed');}
export function observeQuiescedInternalTlsContinuity(plan){
 assert(process.platform==='linux'&&process.arch==='x64'&&process.getuid()===1001);assert(plan.project===project&&plan.applicationRoot===authority+'/installation/private-runtime/application');
 const docker=(...args)=>execFileSync('/usr/bin/docker',args,{encoding:'utf8',timeout:120000,maxBuffer:4*1024**2,stdio:['ignore','pipe','pipe']}).trim();
 const id=assertSingleFullConnectorId(docker(...quiescedConnectorInventory));
 const inspect=()=>JSON.parse(docker('inspect',id))[0],before=inspect(),args=quiescedConnectorRunArguments(before);
 const snapshot=JSON.parse(execFileSync('/usr/bin/python3',[fileURLToPath(new URL('./internal-tls-continuity.py',import.meta.url)),'--authority-only'],{encoding:'utf8',timeout:120000,maxBuffer:4*1024**2,stdio:['ignore','pipe','pipe']}));
 assert(snapshot.database?.systemIdentifier&&Object.keys(snapshot.relations).length>0&&snapshot.roles.length>0);assert.deepEqual(snapshot.connectorStateFiles,{});
 const files=JSON.parse(docker(...args));assert(files&&typeof files==='object'&&!Array.isArray(files)&&Object.keys(files).length>0);for(const [name,digest]of Object.entries(files))assert(!name.startsWith('/')&&!name.split('/').includes('..')&&/^[a-f0-9]{64}$/.test(digest));
 assertSameStoppedConnector(before,inspect());snapshot.connectorStateFiles=files;delete snapshot.checkedUtc;snapshot.scope='retained-authority-and-effects';return snapshot;
}
