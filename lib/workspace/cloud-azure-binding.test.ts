import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { azureProjectDiscoveryBinding } from "./cloud-azure-binding";
const scope = { provider: "azure-foundry" as const, tenantId: "company-a", connectionId: "azure-a", directoryId: "22222222-2222-4222-8222-222222222222", endpoint: "https://example.services.ai.azure.com/api/projects/reviewed" };
const now = Date.now();
async function fixture(run: (path: string, value: {scope: typeof scope; executable: string; configDirectory: string}, marker: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'll-azure-binding-'));
  try {
    const path = join(root,'binding.json'), executable = join(root,'az'), configDirectory = join(root,'config'), marker = join(root,'calls');
    await mkdir(configDirectory,{mode:0o700});
    const cloud = JSON.stringify({name:'AzureCloud',authority:'https://login.microsoftonline.com',management:'https://management.azure.com/'}), token = JSON.stringify({token:'DUMMY_AZURE_READ_TOKEN_123456',expires:Math.floor(now/1000)+600,tenant:scope.directoryId,type:'Bearer'});
    await writeFile(executable, `#!/bin/sh\nprintf x >> '${marker}'\nif [ "$1" = cloud ]; then printf '%s' '${cloud}'; else printf '%s' '${token}'; fi\n`,{mode:0o700});
    const value = {scope:{...scope},executable,configDirectory};await writeFile(path,JSON.stringify(value),{mode:0o600});await run(path,value,marker);
  } finally {await rm(root,{recursive:true,force:true});}
}
test('Azure readiness makes no process/provider call; scan obtains a tenant-bound session before native GET',async()=>fixture(async(path,_value,marker)=>{
  const fetcher = vi.fn(async()=>new Response(JSON.stringify({data:[],has_more:false}),{headers:{'content-type':'application/json'}}));
  const api = await azureProjectDiscoveryBinding(scope,path,{fetch:fetcher,now:()=>now});
  expect(fetcher).not.toHaveBeenCalled();await expect(readFile(marker)).rejects.toThrow();
  expect(await api.scopeIdentity()).toEqual({directoryId:scope.directoryId,endpoint:scope.endpoint});
  expect(await readFile(marker,'utf8')).toBe('xx');
  expect(fetcher).toHaveBeenCalledWith(`${scope.endpoint}/agents?api-version=v1&limit=1`,expect.objectContaining({method:'GET',redirect:'manual',headers:{Authorization:'Bearer DUMMY_AZURE_READ_TOKEN_123456',Accept:'application/json'}}));
}));
test('unsafe or mismatched server configuration refuses; changed binding stops before any native read',async()=>fixture(async(path,value,marker)=>{
  const fetcher=vi.fn(),opts={fetch:fetcher,now:()=>now};
  await chmod(path,0o644);await expect(azureProjectDiscoveryBinding(scope,path,opts)).rejects.toThrow('unavailable');await chmod(path,0o600);
  for(const bad of [null,[],{...value,secret:'PRIVATE'},{...value,scope:{...scope,directoryId:'33333333-3333-4333-8333-333333333333'}},{...value,executable:'/tmp/../az'}]){
    await writeFile(path,JSON.stringify(bad));await expect(azureProjectDiscoveryBinding(scope,path,opts)).rejects.toThrow(/^Reviewed Azure discovery access is unavailable\.$/);
  }
  await writeFile(path,JSON.stringify(value));const api=await azureProjectDiscoveryBinding(scope,path,opts);
  await writeFile(path,JSON.stringify({...value,scope:{...scope,tenantId:'foreign'}}));await expect(api.scopeIdentity()).rejects.toThrow('unavailable');
  expect(fetcher).not.toHaveBeenCalled();await expect(readFile(marker)).rejects.toThrow();
}));
