// Record only authenticated demo screens. Sign-in never has video enabled.
import assert from 'node:assert/strict';
import {mkdir,lstat,realpath,chmod,writeFile,readFile,copyFile,rename} from 'node:fs/promises';
import {join,resolve} from 'node:path';
export async function authenticatedRecording(browser,context,{directory,role,viewport}){
 assert(['ack-requester','ack-reviewer','quote-requester','quote-reviewer','successor-requester','successor-reviewer'].includes(role));
 const root=await realpath(directory),stat=await lstat(directory);assert.equal(root,resolve(directory));assert(stat.isDirectory()&&!stat.isSymbolicLink()&&stat.uid===process.getuid()&&(stat.mode&0o7777)===0o700);
 const videoDirectory=join(root,role+'-video');await mkdir(videoDirectory,{mode:0o700});
 // Storage state remains memory-only, never an exported file or media metadata.
 const storageState=await context.storageState();
 const recorded=await browser.newContext({ignoreHTTPSErrors:false,viewport,storageState,recordVideo:{dir:videoDirectory,size:viewport}});
 const page=await recorded.newPage(),video=page.video();assert(video);await context.close();
 let finished=false;
 return {context:recorded,page,async finish(){if(finished)return;finished=true;await recorded.close();const file=await video.path();assert.equal(resolve(file).startsWith(videoDirectory+'/'),true);const s=await lstat(file);assert(s.isFile()&&!s.isSymbolicLink()&&s.size>0&&s.uid===process.getuid());const canonical=join(videoDirectory,'recording.webm');await rename(file,canonical);await chmod(canonical,0o600);await writeFile(join(root,role+'-video.json'),JSON.stringify({contract:'authenticated-ui-recording-1',role,file:role+'-video/recording.webm',bytes:s.size,engine:'automated Chromium',startsAfterNamedSignIn:true,includesSignIn:false,fullInstalledAcceptance:false})+'\n',{mode:0o600,flag:'wx'});}};
}

// Only known demo media is retained; no sessions/accounts/configuration files.
export async function retainAuthenticatedMedia(source,destination){
 await mkdir(destination,{mode:0o700});const d=await lstat(destination);assert(d.isDirectory()&&!d.isSymbolicLink()&&d.uid===process.getuid()&&(d.mode&0o7777)===0o700);
 for(const role of ['ack-requester','ack-reviewer','quote-requester','quote-reviewer','successor-requester','successor-reviewer']){
  const manifestFile=join(source,role+'-video.json');let content;try{const m=await lstat(manifestFile);assert(m.isFile()&&!m.isSymbolicLink()&&m.uid===process.getuid()&&(m.mode&0o7777)===0o600&&m.size<4096);content=await readFile(manifestFile,'utf8');}catch(error){if(error.code==='ENOENT')continue;throw error;}
  const manifest=JSON.parse(content);assert.equal(manifest.contract,'authenticated-ui-recording-1');assert.equal(manifest.role,role);assert.equal(manifest.includesSignIn,false);assert.equal(manifest.fullInstalledAcceptance,false);
  assert(manifest.file===role+'-video/recording.webm');
  const file=join(source,manifest.file),stat=await lstat(file);assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.uid===process.getuid()&&stat.size===manifest.bytes&&stat.size>0);
  await mkdir(join(destination,role+'-video'),{mode:0o700});await copyFile(file,join(destination,manifest.file));await chmod(join(destination,manifest.file),0o600);await writeFile(join(destination,role+'-video.json'),content,{mode:0o600,flag:'wx'});
 }
 for(const name of ['typed-quote-mobile.png','typed-quote-reviewer-desktop.png','ack-requester-mobile.png','ack-reviewer-desktop.png','successor-quote-mobile.png','successor-quote-reviewer-desktop.png']){
  let stat;try{stat=await lstat(join(source,name));}catch(error){if(error.code==='ENOENT')continue;throw error;}assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.uid===process.getuid());await copyFile(join(source,name),join(destination,name));await chmod(join(destination,name),0o600);
 }
}
