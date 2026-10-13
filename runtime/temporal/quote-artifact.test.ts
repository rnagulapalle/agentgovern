import {it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {verifyProfileArtifacts,verifyArtifacts} from './operations';
const service=Buffer.from('actual profile validator fixture service'),workflow=Buffer.from('profile fixture workflow'),lock=Buffer.from('lock');
const hash=createHash('sha256').update(service).update(workflow).update(lock).digest('hex');
it('explicit quote and retained acknowledgement profiles cannot substitute each others same-byte identities',()=>{
 for(const profile of ['ack','quote'] as const){const id=profile+'-'+hash,m={version:1,artifactHash:hash,buildId:id};expect(()=>verifyProfileArtifacts(profile,id,m,service,workflow,lock)).not.toThrow();expect(()=>verifyProfileArtifacts(profile==='ack'?'quote':'ack',id,m,service,workflow,lock)).toThrow();}
 expect(()=>verifyArtifacts('ack-'+hash,{version:1,artifactHash:hash,buildId:'ack-'+hash},service,workflow,lock)).not.toThrow();expect(()=>verifyArtifacts('quote-'+hash,{version:1,artifactHash:hash,buildId:'quote-'+hash},service,workflow,lock)).toThrow();
});
it('quote profile refuses changed compiled bytes, manifest version, declared hash and unregistered profile',()=>{
 const id='quote-'+hash,m={version:1,artifactHash:hash,buildId:id};
 for(const [a,b,c]of [[Buffer.from('changed'),workflow,lock],[service,Buffer.from('changed'),lock],[service,workflow,Buffer.from('changed')]])expect(()=>verifyProfileArtifacts('quote',id,m,a,b,c)).toThrow();
 expect(()=>verifyProfileArtifacts('quote',id,{...m,version:2},service,workflow,lock)).toThrow();expect(()=>verifyProfileArtifacts('quote',id,{...m,artifactHash:'0'.repeat(64)},service,workflow,lock)).toThrow();expect(()=>verifyProfileArtifacts('other' as never,id,m,service,workflow,lock)).toThrow();
});
