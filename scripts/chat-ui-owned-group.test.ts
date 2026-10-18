import {expect,test} from 'vitest';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {captureOwnedChatGroup,stopOwnedChatGroup,assertOwnedGroupGeneration} from './chat-ui-owned-group';
test('actual detached descendant survives exited leader and shutdown proves group absence; output pipes drain',async()=>{
 const code=`const {spawn}=require('node:child_process');const orphan=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});orphan.on('spawn',()=>process.send('ready'));setInterval(()=>{process.stdout.write('x'.repeat(65536));process.stderr.write('x'.repeat(65536));},10);process.on('message',()=>process.exit(0));`;
 const child=spawn(process.execPath,['-e',code],{detached:true,stdio:['ignore','pipe','pipe','ipc']});
 const ready=once(child,"message");await captureOwnedChatGroup(child);await ready;try{
  await new Promise(r=>setTimeout(r,150));const exited=once(child,'exit');child.send('exit');await exited;
  expect(()=>process.kill(-child.pid!,0)).not.toThrow();
  await stopOwnedChatGroup(child);expect(()=>process.kill(-child.pid!,0)).toThrow();
 }finally{await stopOwnedChatGroup(child);}
},10000);
test('an arbitrary unleased child refuses signaling; genuine live leased leader shuts down',async()=>{
 const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'pipe'});
 try{await expect(stopOwnedChatGroup(child)).rejects.toThrow('lease');expect(child.exitCode).toBeNull();await captureOwnedChatGroup(child);await stopOwnedChatGroup(child);expect(child.signalCode).toBe('SIGKILL');}finally{await stopOwnedChatGroup(child);}
},10000);

test('terminal child plus same-second reused leader refuses; absent exited leader still permits orphan containment',()=>{
 const birth='Sun Oct 11 02:00:00 2026';
 expect(()=>assertOwnedGroupGeneration(birth,birth,true)).toThrow('generation changed');
 expect(()=>assertOwnedGroupGeneration('Sun Oct 11 02:00:01 2026',birth,false)).toThrow('generation changed');
 expect(()=>assertOwnedGroupGeneration(null,birth,true)).not.toThrow();
 expect(()=>assertOwnedGroupGeneration(birth,birth,false)).not.toThrow();
});
