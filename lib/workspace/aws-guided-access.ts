import { execFile } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { BedrockAgentCoreControlClient, ListAgentRuntimesCommand, GetAgentRuntimeCommand } from "@aws-sdk/client-bedrock-agentcore-control";
import { CloudWatchLogsClient, FilterLogEventsCommand, DescribeLogGroupsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { awsAuthorizationIdentity, awsAuthorizationLink, awsObservationSessionPolicy } from "./aws-authorization-contract";
import { discoverySession, type DiscoverySession } from "./cloud-aws-cli";
import { readPrivateDiscoveryBinding } from "./cloud-private-binding";
import { preserveRuntimeInventory, type CloudDiscoveryScope, type AwsRuntimeInventoryApi } from "./cloud-discovery";
import type { WorkflowTelemetryApi } from "./workflow-telemetry";

export interface AwsGuidedAccessConfig {
  version: 1; region: string; brokerRoleArn: string; trustAnchorArn: string; profileArn: string;
  helper: string; certificate: string; privateKey: string; externalIdSecret: string;
  templateBucket: string; templateKey: "onboarding/aws-observation-v1.json";
}
const path = (v: unknown): v is string => typeof v === "string" && /^\/[A-Za-z0-9_./-]{1,512}$/.test(v) && !v.split("/").includes("..");
export function parseAwsGuidedAccessConfig(value: unknown): AwsGuidedAccessConfig {
  const v = value as AwsGuidedAccessConfig;
  if (!v || Object.keys(v).sort().join() !== "brokerRoleArn,certificate,externalIdSecret,helper,privateKey,profileArn,region,templateBucket,templateKey,trustAnchorArn,version"
    || Object.entries(v).some(([key,value]) => key !== "version" && typeof value !== "string")
    || v.version !== 1 || !/^[a-z]{2}-[a-z]+-[1-9]$/.test(v.region)
    || !/^arn:aws:iam::[0-9]{12}:role\/[A-Za-z0-9_+=,.@/-]{1,400}$/.test(v.brokerRoleArn)
    || !path(v.helper) || !path(v.certificate) || !path(v.privateKey) || v.certificate === v.privateKey
    || !/^[a-f0-9]{64}$/.test(v.externalIdSecret) || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(v.templateBucket)
    || v.templateBucket.includes("..") || v.templateKey !== "onboarding/aws-observation-v1.json") throw Error("Reviewed AWS authorization configuration required");
  const account = v.brokerRoleArn.split(":")[4];
  if (![ [v.trustAnchorArn,"trust-anchor"], [v.profileArn,"profile"] ].every(([arn,kind]) => typeof arn === "string" && new RegExp(`^arn:aws:rolesanywhere:${v.region}:${account}:${kind}/[a-f0-9-]{36}$`).test(arn))) throw Error("AWS broker source identity differs");
  return structuredClone(v);
}
export async function readAwsGuidedAccessConfig(file = process.env.LOOPLABS_AWS_AUTHORIZATION_CONFIG) {
  return parseAwsGuidedAccessConfig(await readPrivateDiscoveryBinding(file));
}
async function checkedFile(file: string, executable = false) {
  if (await realpath(file) !== file) throw Error();
  const st = await lstat(file), uid = process.getuid?.();
  if (!st.isFile() || st.isSymbolicLink() || st.nlink !== 1 || uid === undefined
    || executable && (![(uid),0].includes(st.uid) || st.mode & 0o022 || !(st.mode & 0o100))
    || !executable && (st.uid !== uid || st.mode & 0o077 || st.size > 65536)) throw Error();
  return { ino: st.ino, dev: st.dev, size: st.size, mtime: st.mtimeMs, ctime: st.ctimeMs };
}
/** Official AWS Roles Anywhere helper only. No ambient profile, keys, proxy or
 * caller-provided command. A failed source cannot fall back to laptop credentials. */
export async function rolesAnywhereCredentials(config: AwsGuidedAccessConfig): Promise<DiscoverySession> {
  const c = parseAwsGuidedAccessConfig(config), paths = [c.helper,c.certificate,c.privateKey];
  const before = await Promise.all(paths.map((p,i) => checkedFile(p,i === 0)));
  const value = await new Promise<unknown>((resolve,reject) => {
    execFile(c.helper,["credential-process","--certificate",c.certificate,"--private-key",c.privateKey,"--trust-anchor-arn",c.trustAnchorArn,"--profile-arn",c.profileArn,"--role-arn",c.brokerRoleArn,"--region",c.region,"--session-duration","900"],
      { env: { PATH:"/usr/bin:/bin",HOME:"/nonexistent",NODE_ENV:"production" as const,AWS_EC2_METADATA_DISABLED:"true" }, timeout:15000,maxBuffer:65536,killSignal:"SIGKILL",encoding:"utf8" },(error,out) => {
        if (error) { reject(Error("AWS source identity unavailable")); return; }
        try { resolve(JSON.parse(out)); } catch { reject(Error("AWS source identity unavailable")); }
      });
  });
  const after = await Promise.all(paths.map((p,i) => checkedFile(p,i === 0)));
  if (JSON.stringify(before) !== JSON.stringify(after)) throw Error("AWS source identity changed");
  const v = value as Record<string,unknown>;
  if (!v || v.Version !== 1) throw Error("AWS source identity unavailable");
  return discoverySession({ accessKeyId:v.AccessKeyId,secretAccessKey:v.SecretAccessKey,sessionToken:v.SessionToken,expiresAt:v.Expiration });
}
const sdkCredentials = (s: DiscoverySession) => ({ accessKeyId:s.accessKeyId,secretAccessKey:s.secretAccessKey,sessionToken:s.sessionToken,expiration:new Date(s.expiresAt) });
export class AwsGuidedAccess {
  readonly config: AwsGuidedAccessConfig;
  private session: DiscoverySession | undefined;
  private pending: Promise<DiscoverySession> | undefined;
  constructor(config: AwsGuidedAccessConfig, private readonly scope: CloudDiscoveryScope, private readonly epoch: string,
    private readonly source: (config: AwsGuidedAccessConfig) => Promise<DiscoverySession> = rolesAnywhereCredentials) {
    this.config = Object.freeze(parseAwsGuidedAccessConfig(config));
    this.scope = preserveRuntimeInventory(null,{scope,observedAt:new Date().toISOString(),completeness:"partial",records:[],failures:[]}).scope;
    awsAuthorizationIdentity(scope,epoch,this.config.externalIdSecret);
  }
  async authorization(telemetryLogGroup = "") {
    const config = this.config, session = await this.source(config);
    const s3 = new S3Client({ region:config.region, endpoint:`https://s3.${config.region}.amazonaws.com`,credentials:sdkCredentials(discoverySession(session)),maxAttempts:1 });
    try {
      const templateUrl = await getSignedUrl(s3,new GetObjectCommand({ Bucket:config.templateBucket,Key:config.templateKey }),{expiresIn:900});
      return awsAuthorizationLink({scope:this.scope,epoch:this.epoch,secret:config.externalIdSecret,brokerPrincipal:config.brokerRoleArn,templateUrl,telemetryLogGroup});
    } finally { s3.destroy(); }
  }
  private async assumed(): Promise<DiscoverySession> {
    if (this.session && Date.parse(this.session.expiresAt)-Date.now()>60000) return discoverySession(this.session);
    if (this.pending) return this.pending;
    this.pending = (async () => {
      const config = this.config, identity = awsAuthorizationIdentity(this.scope,this.epoch,config.externalIdSecret);
      const source = discoverySession(await this.source(config));
      const client = new STSClient({region:config.region,endpoint:`https://sts.${config.region}.amazonaws.com`,credentials:sdkCredentials(source),maxAttempts:1});
      try {
        const r = await client.send(new AssumeRoleCommand({RoleArn:identity.roleArn,ExternalId:identity.externalId,RoleSessionName:`looplabs-${identity.roleName.slice(-24)}`,DurationSeconds:900,Policy:JSON.stringify(awsObservationSessionPolicy(this.scope))}),{abortSignal:AbortSignal.timeout(10000)});
        const c = r.Credentials;
        this.session = discoverySession({ accessKeyId:c?.AccessKeyId,secretAccessKey:c?.SecretAccessKey,sessionToken:c?.SessionToken,expiresAt:c?.Expiration?.toISOString() });
        return this.session;
      } catch { throw Error("AWS observation role could not be assumed. Review the AWS grant for this connection."); }
      finally { client.destroy(); }
    })();
    try { return await this.pending; } finally { this.pending=undefined; }
  }
  private credentials = async () => sdkCredentials(await this.assumed());
  private async callerIdentity() {
    const c = new STSClient({region:this.scope.region,endpoint:`https://sts.${this.scope.region}.amazonaws.com`,credentials:this.credentials,maxAttempts:1});
    try { const r=await c.send(new GetCallerIdentityCommand({}),{abortSignal:AbortSignal.timeout(10000)}); if(r.Account!==this.scope.accountId)throw Error(); return {Account:r.Account}; }
    catch { throw Error("AWS observation identity could not be verified"); } finally { c.destroy(); }
  }
  inventory(): AwsRuntimeInventoryApi {
    const checked=preserveRuntimeInventory(null,{scope:this.scope,observedAt:new Date().toISOString(),completeness:"partial",records:[],failures:[]}).scope;
    const read = async (input: {maxResults:number;nextToken?:string} | {agentRuntimeId:string;agentRuntimeVersion:string}, list:boolean) => {
      if (list ? Object.keys(input).some(k=>!["maxResults","nextToken"].includes(k)) || !Number.isInteger((input as {maxResults:number}).maxResults) || (input as {maxResults:number}).maxResults<1 || (input as {maxResults:number}).maxResults>100
        : Object.keys(input).sort().join()!=="agentRuntimeId,agentRuntimeVersion" || !/^[A-Za-z][A-Za-z0-9_]{0,47}-[A-Za-z0-9]{10}$/.test((input as {agentRuntimeId:string}).agentRuntimeId) || !/^[1-9][0-9]{0,4}$/.test((input as {agentRuntimeVersion:string}).agentRuntimeVersion)) throw Error("Invalid inventory read");
      if ("nextToken" in input && (typeof input.nextToken!=="string" || !/^\S{1,2048}$/.test(input.nextToken)))throw Error("Invalid inventory page");
      const c=new BedrockAgentCoreControlClient({region:checked.region,endpoint:`https://bedrock-agentcore-control.${checked.region}.amazonaws.com`,credentials:this.credentials,maxAttempts:1});
      try { return list ? await c.send(new ListAgentRuntimesCommand(input as {maxResults:number;nextToken?:string}),{abortSignal:AbortSignal.timeout(10000)}) : await c.send(new GetAgentRuntimeCommand(input as {agentRuntimeId:string;agentRuntimeVersion:string}),{abortSignal:AbortSignal.timeout(10000)}); }
      finally {c.destroy();}
    };
    return {callerIdentity:()=>this.callerIdentity(),listRuntimes:input=>read(input,true),getRuntime:input=>read(input,false)};
  }
  telemetry(): WorkflowTelemetryApi {
    return {callerIdentity:()=>this.callerIdentity(),listEvents:async input=>{
      const prefix=`arn:aws:logs:${this.scope.region}:${this.scope.accountId}:log-group:`;
      if (!input || Object.keys(input).some(k=>!["logGroupIdentifier","startTime","endTime","limit","nextToken"].includes(k)) || !input.logGroupIdentifier.startsWith(prefix)
        || !/^\/[A-Za-z0-9_./#-]{1,250}$/.test(input.logGroupIdentifier.slice(prefix.length)) || input.limit!==100
        || !Number.isSafeInteger(input.startTime) || input.startTime<0 || !Number.isSafeInteger(input.endTime) || input.endTime<=input.startTime || input.endTime-input.startTime>604800000
        || input.nextToken!==undefined && (typeof input.nextToken!=="string" || !/^\S{1,2048}$/.test(input.nextToken)))throw Error("Invalid observation window");
      const c=new CloudWatchLogsClient({region:this.scope.region,endpoint:`https://logs.${this.scope.region}.amazonaws.com`,credentials:this.credentials,maxAttempts:1});
      try {const r=await c.send(new FilterLogEventsCommand({...input}),{abortSignal:AbortSignal.timeout(10000)});return {events:(r.events??[]).map(e=>({eventId:e.eventId,timestamp:e.timestamp,message:e.message})),nextToken:r.nextToken};}
      finally {c.destroy();}
    }};
  }
  async logGroups() {
    await this.callerIdentity();
    const c=new CloudWatchLogsClient({region:this.scope.region,endpoint:`https://logs.${this.scope.region}.amazonaws.com`,credentials:this.credentials,maxAttempts:1});
    try {const r=await c.send(new DescribeLogGroupsCommand({limit:50}),{abortSignal:AbortSignal.timeout(10000)});return {groups:(r.logGroups??[]).filter(g=>typeof g.logGroupName==="string" && /^\/[A-Za-z0-9_./#-]{1,250}$/.test(g.logGroupName)).map(g=>({name:g.logGroupName!,retentionDays:g.retentionInDays??null})),truncated:Boolean(r.nextToken)};}
    finally {c.destroy();}
  }
}

export async function createAwsGuidedAccess(scope:CloudDiscoveryScope,epoch:string){return new AwsGuidedAccess(await readAwsGuidedAccessConfig(),scope,epoch);}
