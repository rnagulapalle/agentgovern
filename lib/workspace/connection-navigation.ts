import { awsPlace, type AwsPlace } from "./aws-journey";

export type ConnectionEntry = { place: AwsPlace | null; connectionId: string | null; coverage: boolean; invalid: boolean };
/** View selection only; inventory and enrollment must still be read from the server. */
export function connectionEntry(params: URLSearchParams): ConnectionEntry {
  const connectionId=params.get("connectionId"),resourceArn=params.get("resourceArn"),version=params.get("version");
  const validConnection=connectionId!==null&&/^[A-Za-z0-9_-]{1,64}$/.test(connectionId);
  const place=resourceArn!==null||version!==null ? awsPlace(JSON.stringify({connectionId,resourceArn,version})):null;
  return {place,connectionId:validConnection?connectionId:null,coverage:params.get("coverage")==="history",invalid:Boolean(connectionId&&!validConnection||(resourceArn!==null||version!==null)&&!place)};
}
export function connectionDestination(params: URLSearchParams) {
  const entry=connectionEntry(params),next=new URLSearchParams();
  if(entry.connectionId)next.set("connectionId",entry.connectionId);
  if(entry.place){next.set("resourceArn",entry.place.resourceArn);next.set("version",entry.place.version);}
  if(entry.coverage)next.set("coverage","history");
  if(entry.invalid)next.set("context","invalid");
  return "/control-plane/connectors"+(next.size?`?${next}`:"");
}
export function agentDestination(place: AwsPlace) {
  return `/control-plane/agents?${new URLSearchParams({connectionId:place.connectionId,resourceArn:place.resourceArn,version:place.version})}`;
}
