// SDK/credential-process contract doubles only. Native AWS acceptance is separate.
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile, chmod, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const sdk=vi.hoisted(()=>{
 const state={calls:[] as {kind:string;input:Record<string,unknown>}[],configs:[] as Record<string,unknown>[],account:"342206308838",fail:false,child:"",execArgs:[] as unknown[]};
 const credentials=()=>({AccessKeyId:"AS"+"IA"+"B".repeat(16),SecretAccessKey:"X".repeat(40),SessionToken:"Y".repeat(32),Expiration:new Date(Date.now()+900000)});
 return {state,credentials,command:(kind:string)=>class {constructor(public input:Record<string,unknown>){}kind=kind;},client:(name:string)=>class {
  constructor(private config:Record<string,unknown>){state.configs.push({...config,name});}
  async send(command:{kind:string;input:Record<string,unknown>}){
   if(typeof this.config.credentials==="function")await this.config.credentials();
   state.calls.push({kind:command.kind,input:structuredClone(command.input)});if(state.fail)throw Error("private AWS diagnostic");
   if(command.kind==="assume")return{Credentials:credentials()};if(command.kind==="identity")return{Account:state.account};
   if(command.kind==="groups")return{logGroups:[{logGroupName:"/company/events",retentionInDays:30},{logGroupName:"https://untrusted.invalid"}],nextToken:"next"};
   if(command.kind==="events")return{events:[],nextToken:undefined};
   return command.kind==="list"?{agentRuntimes:[]}:{agentRuntimeId:command.input.agentRuntimeId};
  }
  destroy(){}
 }};
});
vi.mock("@aws-sdk/client-sts",()=>({STSClient:sdk.client("sts"),AssumeRoleCommand:sdk.command("assume"),GetCallerIdentityCommand:sdk.command("identity")}));
vi.mock("@aws-sdk/client-bedrock-agentcore-control",()=>({BedrockAgentCoreControlClient:sdk.client("agentcore"),ListAgentRuntimesCommand:sdk.command("list"),GetAgentRuntimeCommand:sdk.command("get")}));
vi.mock("@aws-sdk/client-cloudwatch-logs",()=>({CloudWatchLogsClient:sdk.client("logs"),FilterLogEventsCommand:sdk.command("events"),DescribeLogGroupsCommand:sdk.command("groups")}));
vi.mock("@aws-sdk/client-s3",()=>({S3Client:sdk.client("s3"),GetObjectCommand:sdk.command("object")}));
vi.mock("@aws-sdk/s3-request-presigner",()=>({getSignedUrl:async()=>"https://looplabs-onboarding.s3.us-west-2.amazonaws.com/onboarding/aws-observation-v1.json?X-Amz-Expires=900"}));
vi.mock("node:child_process",()=>({execFile:(...args:unknown[])=>{sdk.state.execArgs=args.slice(0,-1);const cb=args.at(-1) as (error:Error|null,text:string)=>void;cb(null,sdk.state.child);}}));
import { AwsGuidedAccess, rolesAnywhereCredentials, readAwsGuidedAccessConfig, createAwsGuidedAccess } from "./aws-guided-access";
import { awsAuthorizationIdentity } from "./aws-authorization-contract";
const scope=()=>({tenantId:"one",connectionId:"aws",accountId:"342206308838",region:"us-west-2"}),epoch="00000000-0000-4000-8000-000000000001";
const config=()=>({version:1 as const,region:"us-west-2",brokerRoleArn:"arn:aws:iam::962639302232:role/LoopLabsObservationBroker",trustAnchorArn:"arn:aws:rolesanywhere:us-west-2:962639302232:trust-anchor/00000000-0000-4000-8000-000000000001",profileArn:"arn:aws:rolesanywhere:us-west-2:962639302232:profile/00000000-0000-4000-8000-000000000002",helper:"/owned/helper",certificate:"/owned/certificate.pem",privateKey:"/owned/key.pem",externalIdSecret:"a".repeat(64),templateBucket:"looplabs-onboarding",templateKey:"onboarding/aws-observation-v1.json" as const});
const source=()=>{const c=sdk.credentials();return{accessKeyId:c.AccessKeyId,secretAccessKey:c.SecretAccessKey,sessionToken:c.SessionToken,expiresAt:c.Expiration.toISOString()};};
beforeEach(()=>{sdk.state.calls=[];sdk.state.configs=[];sdk.state.fail=false;sdk.state.account="342206308838";sdk.state.execArgs=[];});afterEach(()=>vi.unstubAllEnvs());
describe("renewable guided observation transport",()=>{
 it("assumes only the connection role with external ID and a restrictive observation session policy; reuses the short-lived session",async()=>{
  const input=scope(),provider=vi.fn(async()=>source()),client=new AwsGuidedAccess(config(),input,epoch,provider);input.accountId="111111111111";
  expect(await client.inventory().callerIdentity()).toEqual({Account:"342206308838"});await client.inventory().listRuntimes({maxResults:100});await client.inventory().getRuntime({agentRuntimeId:"assistant-1234567890",agentRuntimeVersion:"10"});
  expect(provider).toHaveBeenCalledTimes(1);const assume=sdk.state.calls.find(c=>c.kind==="assume")!;expect(assume.input).toMatchObject({RoleArn:awsAuthorizationIdentity(scope(),epoch,config().externalIdSecret).roleArn,ExternalId:awsAuthorizationIdentity(scope(),epoch,config().externalIdSecret).externalId,DurationSeconds:900});
  const policy=JSON.parse(assume.input.Policy as string);expect(JSON.stringify(policy)).not.toMatch(/Invoke|Secret|Send|Put|Update|Delete|iam:/);expect(JSON.stringify(policy)).toContain("342206308838");
  for(const c of sdk.state.configs)expect(c.endpoint).toMatch(/^https:\/\/(sts|logs|bedrock-agentcore-control|s3)\.us-west-2\.amazonaws\.com$/);
 });
 it("prepares only a reviewed AWS link, without assuming that the customer granted access",async()=>{
  const client=new AwsGuidedAccess(config(),scope(),epoch,async()=>source());expect(await client.authorization("/company/events")).toMatchObject({authorityGranted:false,access:"observation-only"});expect(sdk.state.calls).toEqual([]);
 });
 it("lists safe source metadata and restricts history to the expected account/log ARN",async()=>{
  const client=new AwsGuidedAccess(config(),scope(),epoch,async()=>source());expect(await client.logGroups()).toEqual({groups:[{name:"/company/events",retentionDays:30}],truncated:true});
  const input={logGroupIdentifier:"arn:aws:logs:us-west-2:342206308838:log-group:/company/events",startTime:1,endTime:1000,limit:100 as const};expect(await client.telemetry().listEvents(input)).toEqual({events:[],nextToken:undefined});
  for(const change of [{logGroupIdentifier:"arn:aws:logs:us-west-2:111111111111:log-group:/other"},{limit:101},{startTime:-1},{nextToken:"bad token"}])await expect(client.telemetry().listEvents({...input,...change} as never)).rejects.toThrow("Invalid observation");
 });
 it("refuses malformed inventory selectors before using credentials",async()=>{
  const provider=vi.fn(async()=>source()),client=new AwsGuidedAccess(config(),scope(),epoch,provider);
  for(const value of [{maxResults:0},{maxResults:101},{maxResults:1,nextToken:"bad token"},{maxResults:1,endpoint:"https://untrusted.invalid"}])await expect(client.inventory().listRuntimes(value)).rejects.toThrow();
  await expect(client.inventory().getRuntime({agentRuntimeId:"foreign/path",agentRuntimeVersion:"10"})).rejects.toThrow();expect(provider).not.toHaveBeenCalled();
 });
 it("does not fall back to ambient keys or expose AWS diagnostics on failed source/role/identity",async()=>{
  vi.stubEnv("AWS_ACCESS_KEY_ID","ambient-must-not-be-used");const client=new AwsGuidedAccess(config(),scope(),epoch,async()=>{throw Error("private source secret");});await expect(client.inventory().callerIdentity()).rejects.toThrow("could not be verified");expect(sdk.state.calls).toEqual([]);
  const second=new AwsGuidedAccess(config(),scope(),epoch,async()=>source());sdk.state.fail=true;await expect(second.inventory().callerIdentity()).rejects.toThrow("could not be verified");sdk.state.fail=false;sdk.state.account="111111111111";await expect(second.inventory().callerIdentity()).rejects.toThrow("could not be verified");
 });
 it("reads only a private owned source configuration and validates helper output without inherited environment",async()=>{
  const dir=await realpath(await mkdtemp(join(tmpdir(),"ll-aws-source-test-")));try{
   const c={...config(),helper:join(dir,"helper"),certificate:join(dir,"certificate.pem"),privateKey:join(dir,"key.pem")};
   for(const file of [c.helper,c.certificate,c.privateKey]){await writeFile(file,"fixture only",{mode:0o600});}await chmod(c.helper,0o500);
   const value=sdk.credentials();sdk.state.child=JSON.stringify({Version:1,...value,Expiration:value.Expiration.toISOString()});expect(await rolesAnywhereCredentials(c)).toMatchObject({accessKeyId:value.AccessKeyId});
   const options=sdk.state.execArgs[2] as {env:Record<string,string>;timeout:number};expect(options.env).toEqual({PATH:"/usr/bin:/bin",HOME:"/nonexistent",NODE_ENV:"production",AWS_EC2_METADATA_DISABLED:"true"});expect(options.timeout).toBe(15000);
   sdk.state.child=JSON.stringify({Version:2});await expect(rolesAnywhereCredentials(c)).rejects.toThrow();
   await chmod(c.privateKey,0o644);await expect(rolesAnywhereCredentials(c)).rejects.toThrow();await chmod(c.privateKey,0o600);
   const file=join(dir,"configuration.json");await writeFile(file,JSON.stringify(c),{mode:0o600});vi.stubEnv("LOOPLABS_AWS_AUTHORIZATION_CONFIG",file);expect(await readAwsGuidedAccessConfig()).toEqual(c);expect(await createAwsGuidedAccess(scope(),epoch)).toBeInstanceOf(AwsGuidedAccess);
   await chmod(file,0o644);await expect(readAwsGuidedAccessConfig()).rejects.toThrow();
  }finally{await rm(dir,{recursive:true,force:true});}
 });
});
