import { describe, expect, it } from "vitest";
import { awsAuthorizationIdentity, awsAuthorizationLink, awsObservationRoleTemplate } from "./aws-authorization-contract";
import { parseAwsGuidedAccessConfig } from "./aws-guided-access";
const scope = {tenantId:"workspace",connectionId:"aws-connection",accountId:"342206308838",region:"us-west-2"};
const epoch = "00000000-0000-4000-8000-000000000001", secret = "a".repeat(64);
const principal="arn:aws:iam::962639302232:role/LoopLabsObservationBroker";
const templateUrl="https://looplabs-onboarding.s3.us-west-2.amazonaws.com/onboarding/aws-observation-v1.json?X-Amz-Expires=900";
const input=()=>({scope,epoch,secret,brokerPrincipal:principal,templateUrl,telemetryLogGroup:"/company/agent-events"});
const config=()=>({version:1,region:"us-west-2",brokerRoleArn:principal,trustAnchorArn:"arn:aws:rolesanywhere:us-west-2:962639302232:trust-anchor/00000000-0000-4000-8000-000000000001",profileArn:"arn:aws:rolesanywhere:us-west-2:962639302232:profile/00000000-0000-4000-8000-000000000002",helper:"/private/helper",certificate:"/private/cert.pem",privateKey:"/private/key.pem",externalIdSecret:secret,templateBucket:"looplabs-onboarding",templateKey:"onboarding/aws-observation-v1.json"});
describe("customer-reviewed observation-only AWS authorization",()=>{
 it("generates stable exact role identity and unique tenant/account/recovery connection external IDs",()=>{
  const base=awsAuthorizationIdentity(scope,epoch,secret);expect(base).toEqual(awsAuthorizationIdentity({...scope},epoch,secret));
  expect(base.roleName).toMatch(/^LoopLabsObservation-[a-f0-9]{24}$/);expect(base.externalId).toMatch(/^[a-f0-9]{64}$/);
  for(const next of [{...scope,tenantId:"other"},{...scope,connectionId:"other"},{...scope,accountId:"111111111111"},{...scope,region:"us-east-1"}])expect(awsAuthorizationIdentity(next,epoch,secret).externalId).not.toBe(base.externalId);
  expect(awsAuthorizationIdentity(scope,"00000000-0000-4000-8000-000000000002",secret).externalId).not.toBe(base.externalId);
  expect(awsAuthorizationIdentity(scope,epoch,"b".repeat(64)).externalId).not.toBe(base.externalId);
 });
 it("opens AWS CloudFormation with exact reviewed principal/connection parameters, without claiming granted access",()=>{
  const result=awsAuthorizationLink(input()),url=new URL(result.url),params=new URLSearchParams(url.hash.split("?")[1]);
  expect(url.origin).toBe("https://us-west-2.console.aws.amazon.com");expect(url.pathname).toBe("/cloudformation/home");
  expect(params.get("templateURL")).toBe(templateUrl);expect(params.get("param_BrokerPrincipal")).toBe(principal);expect(params.get("param_ExternalId")).toBe(result.externalId);
  expect(params.get("param_TelemetryLogGroup")).toBe("/company/agent-events");expect(result).toMatchObject({access:"observation-only",authorityGranted:false});
  expect(result.url).not.toContain(secret);
 });
 it("templates only the required read APIs and an exact principal plus external ID trust condition",()=>{
  const t=awsObservationRoleTemplate(),role=t.Resources.ObservationRole.Properties,policy=JSON.stringify(role.Policies);
  expect(role.AssumeRolePolicyDocument.Statement).toEqual([
   {Effect:"Allow",Principal:{AWS:{Ref:"BrokerPrincipal"}},Action:"sts:AssumeRole",Condition:{StringEquals:{"sts:ExternalId":{Ref:"ExternalId"}}}},
   {Effect:"Allow",Principal:{AWS:{Ref:"BrokerPrincipal"}},Action:"sts:SetSourceIdentity",Condition:{Null:{"sts:SourceIdentity":"false"}}},
  ]);
  expect(policy).toContain("bedrock-agentcore:ListAgentRuntimes");expect(policy).toContain("logs:FilterLogEvents");
  expect(policy).not.toMatch(/Invoke|Secret|Put|Delete|Send|Update|Create|iam:|sts:/);
  expect(t.Parameters.TelemetryLogGroup.AllowedPattern).not.toContain(".*");
 });
 it.each(["https://untrusted.invalid/onboarding/aws-observation-v1.json","http://looplabs-onboarding.s3.us-west-2.amazonaws.com/onboarding/aws-observation-v1.json","https://looplabs-onboarding.s3.us-west-2.amazonaws.com/other.json","https://user:password@looplabs-onboarding.s3.us-west-2.amazonaws.com/onboarding/aws-observation-v1.json","https://looplabs-onboarding.s3.us-west-2.amazonaws.com/onboarding/aws-observation-v1.json#other"])("refuses unreviewed template %s",templateUrl=>{expect(()=>awsAuthorizationLink({...input(),templateUrl})).toThrow();});
 it.each(["*","arn:aws:iam::962639302232:root","arn:aws:iam::962639302232:user/operator"])("refuses a broad/non-role principal %s",brokerPrincipal=>{expect(()=>awsAuthorizationLink({...input(),brokerPrincipal})).toThrow();});
 it("refuses malformed scope, epoch, secret and wildcard custom source",()=>{
  expect(()=>awsAuthorizationIdentity({...scope,accountId:"wrong"},epoch,secret)).toThrow();expect(()=>awsAuthorizationIdentity(scope,"restored",secret)).toThrow();expect(()=>awsAuthorizationIdentity(scope,epoch,"short")).toThrow();
  expect(()=>awsAuthorizationLink({...input(),telemetryLogGroup:"/company/*"})).toThrow();
 });
 it("validates a private server identity configuration without allowing alternate account, executable or source injection",()=>{
  expect(parseAwsGuidedAccessConfig(config())).toEqual(config());
  for(const change of [{helper:"relative"},{helper:"/private/../helper"},{certificate:"/private/key.pem"},{externalIdSecret:"short"},{region:"custom-endpoint"},{profileArn:"arn:aws:rolesanywhere:us-west-2:111111111111:profile/00000000-0000-4000-8000-000000000002"},{endpoint:"https://untrusted.invalid"},{region:["us-west-2"]}])expect(()=>parseAwsGuidedAccessConfig({...config(),...change})).toThrow();
 });
});
