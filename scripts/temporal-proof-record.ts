import {lstat,realpath,writeFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {recordScope} from "../lib/connectors/record-scope";
// Offline enrollment for this owned proof only. The legacy shared record1001
// remains forbidden by the unchanged record-scope admission contract.
export const temporalProofRecord=recordScope({version:"record-scope-1",workspaceId:"local-proof",contactId:"2001",recipient:"customer@example.test"});
export async function publishTemporalProofRecord(directory:string) {
  const canonical=await realpath(directory),stat=await lstat(directory);
  if(canonical!==resolve(directory)||!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==process.getuid?.()||(stat.mode&0o777)!==0o700)
    throw Error("Owned proof record directory refused");
  await writeFile(join(canonical,"connector-twin-records.json"),JSON.stringify({records:[temporalProofRecord]}),{flag:"wx",mode:0o600});
  return temporalProofRecord;
}
