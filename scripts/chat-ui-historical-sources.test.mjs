import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {validateHistoricalChatSources,historicalChatSourceSha256} from './chat-ui-extracted-admission.mjs';
import {createHash} from 'node:crypto';
const bytes=readFileSync('docs/evidence/historical-chat-artifact-sources-v1.json.gz');
const original=JSON.parse(gunzipSync(bytes).toString('utf8'));
test('genuine source archive matches fixed component lineage and is ineligible for current authority',()=>{
 expect(createHash('sha256').update(bytes).digest('hex')).toBe(historicalChatSourceSha256);
 expect(validateHistoricalChatSources(original)).toMatchObject({historical:true,eligible:false,releaseAccepted:false,currentSourceValidated:false});
 expect(original.inputs).toHaveLength(288);
});
for(const [name,mutate]of Object.entries({
 'omitted source':s=>delete s.sources[s.inputs[0]],
 'extra source':s=>s.sources['extra.ts']='caller source',
 'altered source bytes':s=>s.sources[s.inputs[0]]+='\n',
 'omitted input and source together':s=>{delete s.sources[s.inputs[0]];s.inputs.shift();},
 'path traversal':s=>{const name=s.inputs[0],bytes=s.sources[name];delete s.sources[name];s.inputs[0]='../outside';s.sources['../outside']=bytes;},
 'altered original component':s=>s.component+='\n',
 'different source lineage':s=>s.overlaySha256='0'.repeat(64),
 'caller eligibility':s=>s.eligible=true,
 'caller authority key':s=>s.releaseAccepted=true,
})){test('historical sources refuse '+name,()=>{const s=structuredClone(original);mutate(s);expect(()=>validateHistoricalChatSources(s)).toThrow();});}
