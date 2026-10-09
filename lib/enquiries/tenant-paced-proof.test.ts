import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {expect,it} from "vitest";
it("requires actual source-bound paced tenant operation, fault isolation and unchanged authority",async()=>{
 const proof=JSON.parse(await readFile("docs/evidence/tenant-paced-operation-proof.json","utf8"));
 expect(proof.measurements).toEqual({companies:2,deniedHttpRequests:64,deniedBrowserRequests:8,deniedDatabaseRequests:13,runtimeGrantStatements:29,restrictedDatabaseLogin:true,databaseTenantRls:false,effects:52,taskQueues:2,workerProcesses:4,schedulerProcesses:2,crashedWorkers:2,replayedHistories:26});
 expect(proof.checks).toHaveLength(11);
 expect(proof.checks.some((c:string)=>c.includes("64 cross-company"))).toBe(true);
 expect(proof.checks.some((c:string)=>c.includes("Six paced two-company waves"))).toBe(true);
 const measured=proof.loadMeasurement;
 expect(measured).toMatchObject({additionalRuns:24,independentRecords:24,sharedAgents:4,effects:52,heldBeforeApproval:48,replayedHistories:24,workerFaultIsolation:true,lostResponseRecords:2,reservationsPreserved:true,duplicateSubmissions:24,duplicateApprovals:48});
 expect(measured.windowMs).toBeGreaterThanOrEqual(150000);
 expect(measured.samples).toHaveLength(24);
 expect(measured.samples.map((s:{ordinal:number})=>s.ordinal).sort((a:number,b:number)=>a-b)).toEqual(Array.from({length:24},(_,i)=>i+1));
 for(const company of ["company-a","company-b"])expect(measured.samples.filter((s:{company:string})=>s.company===company)).toHaveLength(12);
 for(const sample of measured.samples){expect(Number.isInteger(sample.approvalToObservedCompletionMs)).toBe(true);expect(sample.approvalToObservedCompletionMs).toBeGreaterThan(0);expect(sample.approvalToObservedCompletionMs).toBeLessThanOrEqual(measured.windowMs);}
 for(const ordinal of [5,6])expect(measured.samples.find((s:{ordinal:number})=>s.ordinal===ordinal).approvalToObservedCompletionMs).toBeGreaterThanOrEqual(15000);
 expect(measured.waves).toHaveLength(6);
 for(let i=0;i<6;i++){expect(measured.waves[i]).toMatchObject({wave:i+1,effects:4+(i+1)*8,held:(5-i)*8});expect(measured.waves[i].observedAtMs).toBeGreaterThan(i?measured.waves[i-1].observedAtMs:0);}
 expect(proof.scope).toContain("not saturation, remote TLS or an independent security audit");
 expect(Object.keys(proof.sourceFingerprints)).toEqual(expect.arrayContaining(["scripts/tenant-isolation-proof.ts","lib/connectors/scopes.ts","lib/connectors/service.ts","runtime/temporal/record-routing.ts","runtime/temporal/outbox.ts"]));
 for(const [file,hash] of Object.entries(proof.sourceFingerprints))expect(createHash("sha256").update(await readFile(file)).digest("hex"),file).toBe(hash);
});
