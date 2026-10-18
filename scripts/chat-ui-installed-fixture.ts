// Proof-only adapter around the independently measured v4 installed/TLS fixture.
import {installTemporalProofRoles} from './temporal-installed-fixture';
import {readPublishedWebGeneration} from '../lib/workspace/tenant-bootstrap';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
export async function installChatProofRoles(input:Parameters<typeof installTemporalProofRoles>[0]){
 const installed=await installTemporalProofRoles(input);
 try{
  const sealed=join(input.generation,'published-web');await mkdir(sealed,{mode:0o700});
  for(const file of ['web.json','ready.json'])await writeFile(join(sealed,file),await readFile(join(input.generation,file)),{mode:0o600,flag:'wx'});
  const publication=await readPublishedWebGeneration(join(sealed,'web.json'));await publication.assertStable();
  return {...installed,webFile:join(sealed,'web.json')};
 }catch(error){await installed.close();throw error;}
}
