import {describe,it,expect} from 'vitest';
import {validateDeveloperLocation,validateDeveloperState,developerEnvironment} from './dev-local.mjs';
const root='/home/dev/looplabs/.local/development';
const state={version:1,port:55433,webFile:root+'/installation/tenant-generation/web.json',accountsFile:root+'/accounts.json'};
describe('Local developer installation boundaries',()=>{
 it('accepts a regular Ubuntu or Mac user and canonical private paths',()=>{
  expect(()=>validateDeveloperLocation('/home/dev/looplabs','linux',1000)).not.toThrow();
  expect(()=>validateDeveloperLocation('/Users/dev/looplabs','darwin',501)).not.toThrow();
  expect(validateDeveloperState(state,root)).toEqual(state);
 });
 for(const [platform,uid,path] of [['win32',1000,'/home/dev'],['linux',0,'/home/dev'],['linux',1000,'/mnt/c/projects'],['linux',1000,'/home/dev\nother']])it('refuses an unsupported or unsafe location '+platform+uid+JSON.stringify(path),()=>expect(()=>validateDeveloperLocation(path,platform,uid)).toThrow());
 it('refuses retargeted publications, accounts and malformed state',()=>{
  for(const value of [{...state,webFile:'/production/web.json'},{...state,accountsFile:'/other/accounts.json'},{...state,port:5432.5},{...state,version:2},{...state,extra:true}])expect(()=>validateDeveloperState(value,root)).toThrow();
 });
 it('does not inherit hosted bindings, AWS identity, workload or production epochs',()=>{
  const env=developerEnvironment({PATH:'/usr/bin',LOOPLABS_FETCHSANDBOX_BINDING:'private',AWS_PROFILE:'production',LOOPLABS_WORKSPACE_ID:'old',LOOPLABS_RECOVERY_EPOCH:'old'},'LOOPLABS_QUOTE_DEMO_CONFIG=/private/quote.json\nLOOPLABS_TEMPORAL_ADDRESS=remote\n',state);
  expect(env.LOOPLABS_TENANT_WEB_CONFIG).toBe(state.webFile);
  expect(env.LOOPLABS_FETCHSANDBOX_BINDING).toBe('');expect(env.AWS_PROFILE).toBe('');expect(env.LOOPLABS_QUOTE_DEMO_CONFIG).toBe('');expect(env.LOOPLABS_TEMPORAL_ADDRESS).toBe('');
  expect(env.LOOPLABS_WORKSPACE_ID).toBeUndefined();expect(env.LOOPLABS_RECOVERY_EPOCH).toBeUndefined();expect(env.PATH).toBe('/usr/bin');
 });
 it('preserves only an explicitly local existing twin',()=>{
  const env=developerEnvironment({},'LOOPLABS_CONNECTOR_TWIN_URL=http://127.0.0.1:8018\nLOOPLABS_CONNECTOR_TWIN_TOKEN=local-only\n',state);
  expect(env.LOOPLABS_CONNECTOR_TWIN_URL).toBe('http://127.0.0.1:8018');expect(env.LOOPLABS_CONNECTOR_TWIN_TOKEN).toBe('local-only');
  for(const url of ['https://production.example','http://user:pass@localhost:8018','http://localhost:8018?key=secret'])expect(()=>developerEnvironment({},'LOOPLABS_CONNECTOR_TWIN_URL='+url,state)).toThrow();
 });
 it('refuses old explicit recovery fences in .env.local instead of ignoring them',()=>expect(()=>developerEnvironment({},'LOOPLABS_WORKSPACE_ID=production\n',state)).toThrow());
 it('refuses deployment profiles rather than weakening their route restrictions',()=>{
  expect(()=>developerEnvironment({LOOPLABS_DEPLOYMENT_PROFILE:'isolated-control-demo-1'},'',state)).toThrow();
  expect(()=>developerEnvironment({},'LOOPLABS_DEPLOYMENT_PROFILE=\n',state)).toThrow();
 });
 it('clears integrations from merged Next development env files',()=>{
  const env=developerEnvironment({},'LOOPLABS_CHAT_MODEL=old\nLOOPLABS_CHAT_MODEL=hosted\nLOOPLABS_FETCHSANDBOX_BINDING=private\nAWS_PROFILE=production',state);
  expect(env.LOOPLABS_CHAT_MODEL).toBe('');expect(env.LOOPLABS_FETCHSANDBOX_BINDING).toBe('');expect(env.AWS_PROFILE).toBe('');expect(env.NODE_ENV).toBe('development');
 });
});
