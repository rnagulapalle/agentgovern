import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test } from "vitest";
const run = promisify(execFile);
test("Azure browser fixture requires explicit isolation and allows only fixed dummy-authenticated reads", async () => {
  await expect(run(process.execPath, ["--import", "./scripts/discovery-azure-http-fixture.mjs", "--eval", ""], { env: { PATH: "/usr/bin:/bin", NODE_ENV: "test" }, timeout: 2000 })).rejects.toThrow();
  const code = `
    const endpoint='https://company.services.ai.azure.com/api/projects/ops/agents?api-version=v1&limit=1';
    const init={method:'GET',redirect:'manual',headers:{Authorization:'Bearer DUMMY_AZURE_BROWSER_READ_TOKEN_123456'}};
    const data=await(await fetch(endpoint,init)).json(); if(data.data[0].name!=='customer-ops')throw Error();
    for(const [url,options] of [[endpoint,{...init,method:'POST'}],[endpoint,{...init,headers:{Authorization:'Bearer OTHER'}}],['https://foreign.example/agents',init],[endpoint.replace('limit=1','limit=5'),init]]){
      let rejected=false;try{await fetch(url,options)}catch{rejected=true}if(!rejected)throw Error();
    }
    console.log('fixed-reads-only');`;
  const result = await run(process.execPath, ["--import", "./scripts/discovery-azure-http-fixture.mjs", "--input-type=module", "--eval", code], { env: { PATH: "/usr/bin:/bin", NODE_ENV: "test", LOOPLABS_DISCOVERY_BROWSER_PROOF: "isolated" }, timeout: 2000 });
  expect(result.stdout.trim()).toBe("fixed-reads-only");
});
