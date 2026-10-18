import {it,expect} from 'vitest';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {observationInstallerTmpfs} from './aws-observation-release.mjs';

it('gives the offline loader bounded temporary cache space without making root writable',()=>{
 const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}).trim();
 const image='node:22-alpine';
 try{docker('image','inspect',image);}catch{execFileSync('docker',['pull',image],{timeout:90000,stdio:['ignore','pipe','pipe']});}
 const imageId=JSON.parse(docker('image','inspect',image))[0].Id,owner=randomUUID(),ids=[];
 const probe="const fs=require('node:fs');fs.mkdirSync('/tmp/tsx-1001',{recursive:true});fs.writeFileSync('/tmp/tsx-1001/cache','loader-cache');console.log(JSON.stringify({uid:process.getuid(),cache:fs.readFileSync('/tmp/tsx-1001/cache','utf8'),mount:fs.readFileSync('/proc/mounts','utf8').split('\\n').find(x=>x.split(' ')[1]==='/tmp')}));";
 try{
  for(const temporary of [false,true]){
   const name=`ll-observation-cache-${owner}-${temporary?'bounded':'missing'}`;
   expect(docker('ps','-aq','--filter','name=^/'+name+'$')).toBe('');
   const id=docker('create','--name',name,'--label','looplabs.observation-installer-test='+owner,'--network','none','--user','1001:1001','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','128m','--pids-limit','64',...(temporary?['--tmpfs',observationInstallerTmpfs]:[]),imageId,'node','-e',probe);ids.push(id);
   const facts=JSON.parse(docker('inspect',id))[0];
   expect(facts.Image).toBe(imageId);expect(facts.HostConfig.ReadonlyRootfs).toBe(true);expect(facts.HostConfig.NetworkMode).toBe('none');expect(facts.Config.User).toBe('1001:1001');
   if(!temporary){expect(()=>docker('start','--attach',id)).toThrow();expect(JSON.parse(docker('inspect',id))[0].State.ExitCode).not.toBe(0);continue;}
   const result=JSON.parse(docker('start','--attach',id));
   expect(result.uid).toBe(1001);expect(result.cache).toBe('loader-cache');
   const fields=result.mount.split(' ');expect(fields[2]).toBe('tmpfs');
   expect(fields[3].split(',')).toEqual(expect.arrayContaining(['rw','nosuid','nodev','noexec','size=16384k']));
   expect(JSON.parse(docker('inspect',id))[0].State.ExitCode).toBe(0);
  }
 }finally{
  for(const id of ids){const facts=JSON.parse(docker('inspect',id))[0];expect(facts.Config.Labels['looplabs.observation-installer-test']).toBe(owner);expect(facts.Image).toBe(imageId);docker('rm','-f',id);expect(docker('ps','-aq','--filter','id='+id)).toBe('');}
 }
},150000);
