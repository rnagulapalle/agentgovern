import {describe,it,expect} from 'vitest';
import {installedRuntimeTopology} from './staging-installed-runtime-attachment';
describe('installed eight-service role attachment',()=>{
 const files={webFile:'/private/installed/web/web.json',workerFile:'/private/installed/worker/workloads.json',schedulerFile:'/private/installed/scheduler/workloads.json'};
 it('preserves canonical private paths, separate purpose credentials and non-root identity',()=>{
  const c=installedRuntimeTopology(files,'/private/database-ca/ca.pem',1001,1001);
  expect(c.services.web.user).toBe('1001:1001');
  expect(c.services['temporal-scheduler'].env_file).toEqual(['${LOOPLABS_STAGING_PRIVATE_DIR}/scheduler.env']);
  for(const [role,file]of [['web',files.webFile],['temporal-worker',files.workerFile],['temporal-scheduler',files.schedulerFile]] as const){
   const mounts=c.services[role].volumes;expect(mounts).toHaveLength(2);expect(mounts[0].source).toBe(file.slice(0,file.lastIndexOf('/')));expect(mounts.every(m=>m.source===m.target&&m.read_only)).toBe(true);
   expect(mounts.some(m=>m.source==='/private/installed')).toBe(false);
  }
 });
 it('refuses shared or nested credential generations, relative paths and root runtime',()=>{
  for(const bad of [{...files,schedulerFile:files.workerFile},{...files,schedulerFile:'/private/installed/worker/nested/workloads.json'},{...files,webFile:'relative/web.json'}])expect(()=>installedRuntimeTopology(bad,'/private/database-ca/ca.pem',1001,1001)).toThrow();
  expect(()=>installedRuntimeTopology(files,'/private/installed/web/ca.pem',1001,1001)).toThrow();
  expect(()=>installedRuntimeTopology(files,'/private/database-ca/ca.pem',0,1001)).toThrow();
 });
});
