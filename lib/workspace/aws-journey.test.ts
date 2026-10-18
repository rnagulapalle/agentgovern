import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { awsConnectionId, awsAgentName, awsJourneySteps, awsPlace } from "./aws-journey";
import { AwsConnectionJourney, AwsControlReadiness } from "../../components/control-plane/aws-connection-journey";
it("generates stable connection references without an editable identity or cross-region collision", () => {
  expect(awsConnectionId("123456789012", "us-west-2")).toBe("aws-123456789012-us-west-2");
  expect(awsConnectionId("123456789012", "us-east-1")).not.toBe(awsConnectionId("123456789012", "us-west-2"));
  for (const [account, region] of [["123", "us-west-2"], ["123456789012", "us-gov-west-1"], ["123456789012", "../region"]]) expect(() => awsConnectionId(account, region)).toThrow();
  expect(awsAgentName("customer_assistant-1234567890")).toBe("customer assistant"); expect(awsAgentName("other-name")).toBe("other-name");
});
it("first render guides setup without accepting secrets, exposing editable IDs or claiming connected inventory", () => {
  const html = renderToStaticMarkup(createElement(AwsConnectionJourney));
  for (const label of awsJourneySteps) expect(html).toContain(label);
  expect(html).toContain("AWS account ID"); expect(html).toContain("AWS region"); expect(html).not.toContain('name="connectionId"'); expect(html).not.toContain('type="password"');
  expect(html).toContain("Execution enforcement"); expect(html).toContain("Not enabled"); expect(html).toContain("Not checked");
});
it("control onboarding explains required proof and cannot enable execution from presentation or owner mapping", () => {
  const html = renderToStaticMarkup(createElement(AwsControlReadiness));
  expect(html).toContain("Install an execution checkpoint"); expect(html).toContain("attempts to bypass"); expect(html).toContain("does not grant execution permission");
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Enable controls/);
});

it("treats remembered navigation only as validated references and rejects authority or credential fields",()=>{
 const place={connectionId:"aws-123456789012-us-west-2",resourceArn:"arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/test-agent",version:"1"};expect(awsPlace(JSON.stringify(place))).toEqual(place);
 for(const value of [null,"invalid",JSON.stringify({...place,connected:true}),JSON.stringify({...place,version:"../2"}),JSON.stringify({...place,resourceArn:"https://private.invalid"}),"a".repeat(1025)])expect(awsPlace(value)).toBeNull();
});
