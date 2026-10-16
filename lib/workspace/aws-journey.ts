// Presentation only. These labels cannot enroll an identity or grant execution.
export const awsJourneySteps = ["AWS account", "Discover agents", "Review activity", "Onboard agent"] as const;
export function awsConnectionId(accountId: string, region: string) {
  if (!/^[0-9]{12}$/.test(accountId) || !/^[a-z]{2}-[a-z]+-[1-9]$/.test(region)) throw Error("Enter a valid AWS account and region.");
  return `aws-${accountId}-${region}`;
}
export function awsAgentName(resourceId: string) {
  return resourceId.replace(/-[A-Za-z0-9]{10}$/, "").replaceAll("_", " ");
}


// A browser bookmark only. Every restore rereads authorized server inventory and
// enrollment; this value cannot establish connection, ownership or approval.
export const awsPlaceKey = "looplabs.aws.place.v1";
export interface AwsPlace { connectionId:string; resourceArn:string; version:string }
export function awsPlace(value:unknown):AwsPlace|null {
 if(typeof value!=="string"||value.length>1024)return null;
 try {const v=JSON.parse(value);if(!v||Object.keys(v).sort().join()!=="connectionId,resourceArn,version"||typeof v.connectionId!=="string"||!/^[A-Za-z0-9_-]{1,64}$/.test(v.connectionId)||typeof v.resourceArn!=="string"||!/^arn:aws:bedrock-agentcore:[a-z0-9-]+:[0-9]{12}:runtime\/[A-Za-z0-9_-]{1,160}$/.test(v.resourceArn)||typeof v.version!=="string"||!/^[1-9][0-9]{0,4}$/.test(v.version))return null;return v;}catch{return null;}
}
export type AwsConnectionCoverage = { history:"not-checked"|"connected"|"unavailable"|"setup-required"; approvals:"not-checked"|"connected"|"unavailable"|"setup-required" };
