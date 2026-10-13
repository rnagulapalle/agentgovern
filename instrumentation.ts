// Next invokes scoped bootstrap only in its Node server runtime.
export async function register() {
 if(process.env.NEXT_RUNTIME==='nodejs'){
  const file=process.env.LOOPLABS_TENANT_WEB_CONFIG;
  if(!file)throw Error('Scoped server installation unavailable.');
  const {bootstrapTenantContext}=await import('./lib/workspace/tenant-bootstrap');
  const quoteFile=process.env.LOOPLABS_QUOTE_DEMO_CONFIG;
  if(process.env.LOOPLABS_QUOTE_BACKGROUND_CONFIG&&!quoteFile)throw Error('Quote background requires an exact quote web installation.');
  const initializer=quoteFile?(await import('./lib/quotes/native-demo-bootstrap')).nativeQuoteDemoInitializer(quoteFile,undefined,process.env.LOOPLABS_QUOTE_BACKGROUND_CONFIG):undefined;
  await bootstrapTenantContext(file,true,false,undefined,undefined,initializer);
 }
}
