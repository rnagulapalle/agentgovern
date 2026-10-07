import { createHash } from "node:crypto";
import { it, expect } from "vitest";
import { operationsConfig, OperationsHealth, verifyArtifacts } from "./operations";
const local = { LOOPLABS_TEMPORAL_ADDRESS:"127.0.0.1:7233", LOOPLABS_TEMPORAL_NAMESPACE:"default", LOOPLABS_TEMPORAL_TASK_QUEUE:"ack", LOOPLABS_TEMPORAL_BUILD_ID:"v1", LOOPLABS_TEMPORAL_ALLOW_INSECURE_LOOPBACK:"true" };
it("allows only explicit credential-free local proof transport", () => {
  const c=operationsConfig(local,"worker"); expect(c.activitySlots).toBe(5); expect(c.healthPort).toBe(9320); expect(c.insecureLoopback).toBe(true);
  expect(operationsConfig(local,"scheduler").healthPort).toBe(9321);
});
it("requires authenticated TLS remotely and supports certificate or API-key configuration", () => {
  const remote={ ...local, LOOPLABS_TEMPORAL_ADDRESS:"cluster.example.com:7233", LOOPLABS_TEMPORAL_ALLOW_INSECURE_LOOPBACK:"false", LOOPLABS_TEMPORAL_API_KEY:"private-test-key" };
  expect(operationsConfig(remote,"worker").insecureLoopback).toBe(false);
  const { LOOPLABS_TEMPORAL_API_KEY: omitted, ...mtls } = remote; expect(omitted).toBeDefined();
  expect(operationsConfig({ ...mtls, LOOPLABS_TEMPORAL_CERT_PATH:"/private/cert", LOOPLABS_TEMPORAL_KEY_PATH:"/private/key" },"worker").certPath).toBe("/private/cert");
  expect(() => operationsConfig(mtls,"worker")).toThrow("TLS");
});
it.each([
  { LOOPLABS_TEMPORAL_ADDRESS:"evil.example:7233" }, { LOOPLABS_TEMPORAL_ADDRESS:"http://localhost:7233" },
  { LOOPLABS_TEMPORAL_ADDRESS:"127.0.0.1:0" }, { LOOPLABS_TEMPORAL_ADDRESS:"localhost:65536" },
  { LOOPLABS_TEMPORAL_ALLOW_INSECURE_LOOPBACK:"yes" }, { LOOPLABS_TEMPORAL_API_KEY:"must-not-send" },
  { LOOPLABS_TEMPORAL_CERT_PATH:"/cert" }, { LOOPLABS_TEMPORAL_KEY_PATH:"/key" },
  { LOOPLABS_TEMPORAL_NAMESPACE:"" }, { LOOPLABS_TEMPORAL_BUILD_ID:"v1.2" }, { LOOPLABS_TEMPORAL_TASK_QUEUE:"a/b" },
  { LOOPLABS_TEMPORAL_HEALTH_PORT:"80" }, { LOOPLABS_TEMPORAL_ACTIVITY_SLOTS:"21" },
  { LOOPLABS_TEMPORAL_WORKFLOW_SLOTS:"0" }, { LOOPLABS_TEMPORAL_POLL_MS:"0.5" },
  { LOOPLABS_TEMPORAL_POLL_MS:"" }, { LOOPLABS_TEMPORAL_POLL_MS:"-1" }, { LOOPLABS_TEMPORAL_POLL_MS:"30001" },
])("rejects malformed or unsafe configuration %s", override => {
  expect(() => operationsConfig({ ...local, ...override },"worker")).toThrow();
});
it("rejects unknown service roles and accepts bounded explicit capacities", () => {
  expect(() => operationsConfig(local,"both")).toThrow("role");
  expect(operationsConfig({ ...local, LOOPLABS_TEMPORAL_ACTIVITY_SLOTS:"2", LOOPLABS_TEMPORAL_WORKFLOW_SLOTS:"4", LOOPLABS_TEMPORAL_POLL_MS:"250", LOOPLABS_TEMPORAL_HEALTH_PORT:"9330" },"worker")).toMatchObject({activitySlots:2,workflowSlots:4,pollMs:250,healthPort:9330});
});
it("readiness detects failures, stale checks and shutdown without using backlog as a restart trigger", () => {
  const h=new OperationsHealth("scheduler",15000);
  expect(h.snapshot(20000,true).ready).toBe(false);
  h.success(20000,10,20,61);
  expect(h.snapshot(20001,true)).toMatchObject({ready:true,scheduled:10,pending:20,alerts:["dispatch_backlog_older_than_60s"]});
  expect(h.snapshot(20001,false).ready).toBe(false);
  expect(h.snapshot(40000,true).alerts).toContain("health_check_stale");
  h.failure(40000); expect(h.snapshot(40001,true)).toMatchObject({ready:false,consecutiveFailures:1});
  h.success(41000); expect(h.snapshot(41001,true)).toMatchObject({ready:true,consecutiveFailures:0});
  h.stopping=true; expect(h.snapshot(41002,true).ready).toBe(false);
});

it("binds deployment IDs to service, workflow and lockfile bytes", () => {
  const service=Buffer.from("worker"), workflow=Buffer.from("workflow"), lock=Buffer.from("lock");
  const hash=createHash("sha256").update(service).update(workflow).update(lock).digest("hex");
  const id=`ack-${hash}`, manifest={version:1,artifactHash:hash,buildId:id};
  expect(()=>verifyArtifacts(id,manifest,service,workflow,lock)).not.toThrow();
  for(const bad of [null,{...manifest,version:2},{...manifest,artifactHash:"wrong"},{...manifest,buildId:"old"}])
    expect(()=>verifyArtifacts(id,bad,service,workflow,lock)).toThrow("artifacts");
  expect(()=>verifyArtifacts("old",manifest,service,workflow,lock)).toThrow();
  expect(()=>verifyArtifacts(id,manifest,Buffer.from("changed"),workflow,lock)).toThrow();
});
