// Proof-only bounded stdin; never reads laptop credential profiles or logs values.
import assert from 'node:assert/strict';
export function validateChatModelSession(value,now=Date.now()){
 assert(value&&typeof value==='object'&&!Array.isArray(value),'Scoped model session required');
 assert.deepEqual(Object.keys(value).sort(),['accessKeyId','expiration','secretAccessKey','sessionToken']);
 assert(/^ASIA[A-Z0-9]{16}$/.test(value.accessKeyId));assert(/^[A-Za-z0-9/+]{40}$/.test(value.secretAccessKey));
 assert(typeof value.sessionToken==='string'&&value.sessionToken.length>=16&&value.sessionToken.length<=12000&&!/[\s\x00-\x1f]/.test(value.sessionToken));
 assert(typeof value.expiration==='string');const remaining=Date.parse(value.expiration)-now;assert(Number.isFinite(remaining)&&remaining>300000&&remaining<=5400000,'Bounded session expiry required');return value;
}
export async function readChatModelSession(stream){
 const chunks=[];let size=0,timer;
 try{return await Promise.race([(async()=>{for await(const chunk of stream){const bytes=Buffer.from(chunk);size+=bytes.length;assert(size<=16384,'Model input limit exceeded');chunks.push(bytes);}return validateChatModelSession(JSON.parse(Buffer.concat(chunks).toString('utf8')));})(),new Promise((_,reject)=>{timer=setTimeout(()=>{stream.destroy();reject(Error('Model input deadline exceeded'));},10000);})]);}
 finally{clearTimeout(timer);for(const chunk of chunks)chunk.fill(0);}
}
export function chatModelEnvironment(session){validateChatModelSession(session);return {AWS_ACCESS_KEY_ID:session.accessKeyId,AWS_SECRET_ACCESS_KEY:session.secretAccessKey,AWS_SESSION_TOKEN:session.sessionToken,AWS_REGION:'us-west-2'};}
