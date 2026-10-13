import {test,expect} from 'vitest';
import {readFileSync,realpathSync,mkdtempSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {historicalReceiptPins,readHistoricalProof,validateHistoricalSourceStructure,validateHistoricalSourceSnapshot} from './historical-proof-sources.mjs';
const bytes=readFileSync('docs/evidence/historical-runtime-sources-v1.json.gz');
const original=()=>JSON.parse(gunzipSync(bytes));
test('all twenty original receipts retain exact source bytes and cannot grant current or release eligibility',()=>{
 const all=validateHistoricalSourceSnapshot(bytes);expect(Object.keys(all.sources)).toHaveLength(197);
 for(const name of Object.keys(historicalReceiptPins)){const proof=readHistoricalProof(name);expect(proof).toMatchObject({historical:true,eligible:false,releaseAccepted:false,currentSourceValidated:false,production:false});expect(Object.keys(proof.sources).sort()).toEqual(Object.keys(proof.receipt.sourceFingerprints).sort());for(const [file,source]of Object.entries(proof.sources))expect(createHash('sha256').update(source).digest('hex')).toBe(proof.receipt.sourceFingerprints[file]);}
 expect(()=>readHistoricalProof('connector-proof.json')).toThrow('Unknown historical receipt');
});
test.each(['missingSource','extraSource','changedSource','missingReceipt','extraReceipt','changedReceipt','originCommit','originOverlay','eligibility','production','unknownField','pathEscape','absolutePath','dotPath'])('refuses altered historical structure %s',kind=>{
 const value=original(),file=Object.keys(value.sources)[0],name=Object.keys(value.receipts)[0];
 if(kind==='missingSource')delete value.sources[file];if(kind==='extraSource')value.sources['unmeasured.ts']='x';if(kind==='changedSource')value.sources[file]+='\n// changed';
 if(kind==='missingReceipt')delete value.receipts[name];if(kind==='extraReceipt')value.receipts['unmeasured.json']='{}';if(kind==='changedReceipt')value.receipts[name]+='\n';
 if(kind==='originCommit')value.sourceBaseCommit='0'.repeat(40);if(kind==='originOverlay')value.sourceOverlaySha256='0'.repeat(64);if(kind==='eligibility')value.eligible=true;if(kind==='production')value.production=true;if(kind==='unknownField')value.executionAuthorized=true;
 if(kind==='pathEscape')value.sources['../outside.ts']='x';if(kind==='absolutePath')value.sources['/tmp/outside.ts']='x';if(kind==='dotPath')value.sources['lib/./outside.ts']='x';
 expect(()=>validateHistoricalSourceStructure(value)).toThrow();
});
test('changed compressed bytes, malformed JSON and unknown receipt cannot be accepted',()=>{
 expect(()=>validateHistoricalSourceSnapshot(Buffer.concat([bytes,Buffer.from('\n')]))).toThrow('Pinned original snapshot bytes changed');expect(()=>validateHistoricalSourceSnapshot(Buffer.from('{}'))).toThrow();expect(()=>readHistoricalProof('../outside.json')).toThrow('Unknown historical receipt');
});
test('symlink or oversized snapshot refuses before reading candidate content',()=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'ll-history-reader-')));
 try{const path=join(dir,'snapshot.gz');symlinkSync(join(process.cwd(),'docs/evidence/historical-runtime-sources-v1.json.gz'),path);expect(()=>readHistoricalProof(Object.keys(historicalReceiptPins)[0],{snapshotFile:path})).toThrow('Snapshot symlink ancestry refused');rmSync(path);writeFileSync(path,Buffer.alloc(1048577));expect(()=>readHistoricalProof(Object.keys(historicalReceiptPins)[0],{snapshotFile:path})).toThrow('Bounded regular snapshot required');}finally{rmSync(dir,{recursive:true,force:true});}
});
