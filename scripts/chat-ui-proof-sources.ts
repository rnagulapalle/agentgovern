// Producer preflight only. Hashes are input identity, never image provenance or
// evidence that a browser/model/provider trial has passed.
import { readFile } from 'node:fs/promises';
import { validateConnectorProofSources } from './connector-proof-sources';
export async function validateChatProofSources(root=process.cwd()) {
 const bytes=await readFile(root+'/scripts/chat-ui-current-sources.json');
 const input:unknown=JSON.parse(bytes.toString('utf8'));
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Closed chat source inventory required');
 const value=input as Record<string,unknown>;
 if(Object.keys(value).sort().join(',')!=='contract,files,roots'||value.contract!=='installed-chat-source-inventory-2'||!Array.isArray(value.roots)||!value.roots.length||!Array.isArray(value.files)||!value.files.length||value.files.some(f=>typeof f!=='string'))throw Error('Closed chat source inventory required');
 if(value.roots.some(f=>typeof f!=='string'||!(value.files as unknown[]).includes(f)))throw Error('Closed chat source inventory required');
 return validateConnectorProofSources(root,[...value.files as string[],'scripts/chat-ui-current-sources.json']);
}
