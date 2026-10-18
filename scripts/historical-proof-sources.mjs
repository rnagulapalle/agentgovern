// Exact original-source consistency only. Never current runtime, enrollment,
// release, execution or enterprise acceptance authority.
import assert from 'node:assert/strict';
import {constants,openSync,closeSync,lstatSync,fstatSync,readSync,realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const keys=(value,expected)=>assert.deepEqual(Object.keys(value).sort(),[...expected].sort());
const safePath=path=>assert(typeof path==='string'&&path.length<=240&&/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(path)&&!path.split('/').some(x=>x==='.'||x==='..'),'Unsafe historical source path');
export const historicalSnapshotSha256="691646c6470f449d676147aafad7413f07f9ec7a94a514c0e6c0a05c377e1639";
export const historicalReceiptPins=Object.freeze({
  "gateway-bypass-proof.json": "f7e4a1ca153b8c1b4dd26a9748d5b80e7e22ba7043125812c3f73ba6f04bc174",
  "staging-platform-browser-proof.json": "8ea2c138c5621cb2e3a0c3104d90fd7e1c8124e355fff7426b3c7a5bb2b5b489",
  "staging-candidate-package-proof.json": "daa5d3fbfc92edde41614e19641f217f341809bb1c58b029e15ee706ca8edec8",
  "staging-drain-proof.json": "4f100d87ec4121051237ad907dc9ebaec9e4c16933266525704f9ff5374d5bc0",
  "staging-planner-session-proof.json": "a63e580a66e8f196df368842cf4aeb5dd2074a9b3ce504e52afe228d5a89ba36",
  "staging-reset-proof.json": "ee18f9a6ef4d8290e6c5dae5a4835adf0cbe9e38b4a3cf0124a69e45bd4d9001",
  "staging-semantic-proof.json": "584d2ef2b4b75b4f7e3f905b9474f1b55a633158b50502150fe978867a0fba7b",
  "hosted-connector-proof.json": "9087b08af21ed333834158b3e16fa319af825d19ce287a5ab0d9488b7d90f372",
  "chat-ui-proof.json": "0bff515e51bd4f9ccb86e9f0ec235920138b920f910944005247c154aece395b",
  "tenant-isolation-proof.json": "e9a539ff4605d303aaf8df20a2fb532b19ff61abadbfe2982709b7b6fc30bc74",
  "tenant-paced-operation-proof.json": "e3e9f84c7af4f569d741ed37a46a5855c679a0807ecb33c2dacc22c0a6250b43",
  "workspace-restore-proof.json": "fec6f1c9675221c317a70beb3243ee337c0de26da6c46f2976ad2496a54c09c3",
  "temporal-proof.json": "8a6d79330c1ef691c862adb59dc5a84b0229650ec83d0500691cdabf263c3d10",
  "temporal-version-proof.json": "e2dc0a49777978e16900bce6510ed93f9c2605a91a6b8cf90359a17b01f69706",
  "temporal-dispatch-proof.json": "18703480b28ac4afa20600b9403a7b48cfeb5aa73625750e0899a49cd6ae948e",
  "temporal-load-proof.json": "bb4dc399d2b495f0618b57ffb7900b9f449caf35e21f9a6e269673eacd1f2b4d",
  "temporal-container-proof.json": "7e86c9ac5db5263b781f7849bd0de2f414aa26cbe87c78331543972d1c0c92ca",
  "temporal-record-proof.json": "02c33bbaffa672a4d4369d01bd36faf880c15209c079fb2656d553c59494aa0d",
  "temporal-approved-load-proof.json": "384573b2ecb8781d81925c00fb092554add36cd17d9fe132bc4b2210e87c16dc",
  "temporal-shared-agent-proof.json": "1705bf0e1b133527475d2cacc9fd5719470a223479d3051901ef18e7c147162a"
});
export function validateHistoricalSourceStructure(snapshot){
 keys(snapshot,['contract','sourceBaseCommit','sourceOverlaySha256','historical','eligible','production','receipts','sources']);
 assert.equal(snapshot.contract,'historical-runtime-source-snapshot-1');
 assert.equal(snapshot.sourceBaseCommit,'46cf28cef76b6643aedacc5c1c1dd52e05826019');
 assert.equal(snapshot.sourceOverlaySha256,'8693b25024bc0e88e1fac83ea5f149079f634a9146ca020770774f5f63c3e259');
 assert.equal(snapshot.historical,true);assert.equal(snapshot.eligible,false);assert.equal(snapshot.production,false);
 keys(snapshot.receipts,Object.keys(historicalReceiptPins));
 const expected=new Map(),receipts={};
 for(const [name,pin]of Object.entries(historicalReceiptPins)){
  safePath(name);const raw=snapshot.receipts[name];assert.equal(typeof raw,'string');assert.equal(sha(raw),pin,'Original receipt bytes changed: '+name);
  const receipt=JSON.parse(raw);assert(receipt.sourceFingerprints&&Object.keys(receipt.sourceFingerprints).length>0);
  for(const [file,digest]of Object.entries(receipt.sourceFingerprints)){
   safePath(file);assert(/^[a-f0-9]{64}$/.test(digest),'Malformed historical digest');
   assert(!expected.has(file)||expected.get(file)===digest,'Original source lineages conflict');expected.set(file,digest);
  }receipts[name]=receipt;
 }
 for(const file of Object.keys(snapshot.sources))safePath(file);
 keys(snapshot.sources,[...expected.keys()]);
 for(const [file,digest]of expected){assert.equal(typeof snapshot.sources[file],'string');assert.equal(sha(snapshot.sources[file]),digest,'Historical source bytes changed: '+file);}
 return {historical:true,eligible:false,releaseAccepted:false,currentSourceValidated:false,production:false,receipts,sources:snapshot.sources};
}
export function validateHistoricalSourceSnapshot(bytes){
 assert(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=1048576,'Bounded original snapshot bytes required');
 assert.equal(sha(bytes),historicalSnapshotSha256,'Pinned original snapshot bytes changed');
 const json=gunzipSync(bytes,{maxOutputLength:16777216});
 return validateHistoricalSourceStructure(JSON.parse(json.toString('utf8')));
}
function originalSnapshotBytes(path){
 const file=resolve(path);assert.equal(realpathSync(file),file,'Snapshot symlink ancestry refused');
 const named=lstatSync(file);assert(named.isFile()&&!named.isSymbolicLink()&&named.nlink===1&&named.size>0&&named.size<=1048576,'Bounded regular snapshot required');
 const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const opened=fstatSync(fd),fields=['dev','ino','size','mode','mtimeMs','ctimeMs','nlink'];for(const f of fields)assert.equal(opened[f],named[f]);
  const bytes=Buffer.alloc(opened.size+1);let n=0;while(n<bytes.length){const count=readSync(fd,bytes,n,bytes.length-n,n);if(!count)break;n+=count;}assert.equal(n,opened.size);
  const after=fstatSync(fd),namespace=lstatSync(file);for(const f of fields){assert.equal(after[f],opened[f]);assert.equal(namespace[f],opened[f]);}return bytes.subarray(0,n);
 }finally{closeSync(fd);}
}
export function readHistoricalProof(name,{snapshotFile=fileURLToPath(new URL('../docs/evidence/historical-runtime-sources-v1.json.gz',import.meta.url))}={}){
 assert(Object.hasOwn(historicalReceiptPins,name),'Unknown historical receipt');
 const snapshot=validateHistoricalSourceSnapshot(originalSnapshotBytes(snapshotFile)),receipt=snapshot.receipts[name];
 return Object.freeze({...snapshot,receipt,sources:Object.freeze(Object.fromEntries(Object.keys(receipt.sourceFingerprints).map(file=>[file,snapshot.sources[file]])))});
}
