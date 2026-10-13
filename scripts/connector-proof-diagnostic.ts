import { AssertionError } from 'node:assert';
import { ControlError } from '../lib/durable/contracts';
const sqlCodes=new Set(['42501','23514','23503','23505','23502','42P01','42703','40P01','55P03','57014','08006']);
export type ProofHttpDiagnostic=Readonly<{route:'connectors'|'workflows'|'enquiries';operation:'read'|'prepare'|'start'|'propose'|'approve'|'execute'|'reconcile'|'verify'|'create';status:number}>;
/** No message, stack, expected/actual assertion values, request or credentials. */
export function connectorFailureDiagnostic(error:unknown,checkIndex:number,http?:ProofHttpDiagnostic){
 const type=error instanceof AssertionError?'assertion':error instanceof ControlError?'control':error instanceof Error?'error':'unknown';
 const code=error instanceof Error&&'code'in error&&typeof error.code==='string'&&sqlCodes.has(error.code)?error.code:null;
 const status=error instanceof ControlError&&Number.isInteger(error.status)&&error.status>=400&&error.status<=599?error.status:null;
 const location=error instanceof Error&&typeof error.stack==='string'?error.stack.match(/\bconnector-proof\.ts:(\d{1,5}):\d{1,5}\b/):null;
 const lastHttp=http&&['connectors','workflows','enquiries'].includes(http.route)&&['read','prepare','start','propose','approve','execute','reconcile','verify','create'].includes(http.operation)&&Number.isInteger(http.status)&&http.status>=100&&http.status<=599?{route:http.route,operation:http.operation,status:http.status}:null;
 return {contract:'connector-proof-failure-1',checkIndex:Number.isSafeInteger(checkIndex)&&checkIndex>=0&&checkIndex<=1000?checkIndex:null,type,sqlCode:code,controlStatus:status,assertionLine:location?Number(location[1]):null,lastHttp,successfulReceipt:false};
}
