// Presentation only. These labels cannot enroll an identity or grant execution.
export const awsJourneySteps = ["AWS account", "Discover agents", "Review activity", "Onboard agent"] as const;
export function awsConnectionId(accountId: string, region: string) {
  if (!/^[0-9]{12}$/.test(accountId) || !/^[a-z]{2}-[a-z]+-[1-9]$/.test(region)) throw Error("Enter a valid AWS account and region.");
  return `aws-${accountId}-${region}`;
}
export function awsAgentName(resourceId: string) {
  return resourceId.replace(/-[A-Za-z0-9]{10}$/, "").replaceAll("_", " ");
}
