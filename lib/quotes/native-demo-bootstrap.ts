/** Actual scoped web bootstrap hook. Production remains unsupported until the
 * native execution transport has an approved secure deployment contract. */
import {ControlError} from '../durable/contracts';
import type {ExecutionContext} from '../durable/pg-transport';
import type {TenantInitializer} from '../workspace/tenant-bootstrap';
import {readQuoteExecutionGeneration} from './execution-generation';
import {createNativeQuoteDemo} from './native-demo-factory';
import {configureQuoteDemo} from './demo-registry';
export function nativeQuoteDemoInitializer(file:string,execution:ExecutionContext={kind:'installed-runtime'},backgroundFile?:string):TenantInitializer{
 return async web=>{
  const publication=await readQuoteExecutionGeneration(file,execution);
  const db=web.get(publication.metadata.workspaceId);if(!db)throw new ControlError(503,'Quote configuration has no exact installed web pool.');
  const installed=await createNativeQuoteDemo(db,file,execution,undefined,backgroundFile);
  await publication.assertStable();await installed.assertStable();configureQuoteDemo(installed.control);
 };
}
