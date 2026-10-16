import {it,expect} from 'vitest';
import {observationVolume,assertObservationHostChange,assertObservationMounts,observationConfig} from './aws-observation-release.mjs';
import {assertHostConfigurationUnchanged,webProfileEnvironment,assertProfileOnlyChange} from './control-demo-web-release.mjs';
const source='/srv/looplabs-production/config/aws-observation-2026101500000001',attachment={source,target:'/run/aws-observation',read_only:true,type:'bind'};
const hostMount=()=>({Type:'bind',Source:source,Target:attachment.target,ReadOnly:true,BindOptions:{Propagation:'rprivate'}});
it('permits exactly one private read-only AWS mount and leaves all other host settings unchanged',()=>{
 const before={ReadonlyRootfs:true,CapDrop:['ALL'],Memory:2048,Mounts:[{Type:'bind',Source:'/old',Target:'/old',ReadOnly:true}]};const after={...before,Mounts:[...before.Mounts,hostMount()]};
 expect(()=>assertObservationHostChange(before,after,attachment,assertHostConfigurationUnchanged)).not.toThrow();
 for(const m of [{...hostMount(),ReadOnly:false},{...hostMount(),Source:'/other'},{...hostMount(),BindOptions:{Propagation:'rshared'}},{...hostMount(),BindOptions:{Propagation:'rprivate',CreateMountpoint:true}},{...hostMount(),VolumeOptions:{}}])expect(()=>assertObservationHostChange(before,{...after,Mounts:[...before.Mounts,m]},attachment,assertHostConfigurationUnchanged)).toThrow();
 for(const change of [{Memory:0},{CapDrop:[]},{ReadonlyRootfs:false},{Binds:['/other:/run/aws-observation:ro']}])expect(()=>assertObservationHostChange(before,{...after,...change},attachment,assertHostConfigurationUnchanged)).toThrow();
 expect(()=>assertObservationHostChange(before,{...after,Mounts:[...after.Mounts,hostMount()]},attachment,assertHostConfigurationUnchanged)).toThrow();
 expect(()=>assertObservationHostChange(before,before,null,assertHostConfigurationUnchanged)).not.toThrow();
 expect(()=>assertObservationHostChange(after,after,attachment,assertHostConfigurationUnchanged)).not.toThrow();
});
it('checks actual Docker mounts separately from configuration and preserves exact rollback mounts',()=>{
 const before=[{Destination:'/old',Source:'/old',RW:false}],mount={Type:'bind',Destination:attachment.target,Source:source,RW:false,Propagation:'rprivate'};
 expect(()=>assertObservationMounts(before,[...before,mount],attachment)).not.toThrow();
 for(const m of [{...mount,RW:true},{...mount,Source:'/other'},{...mount,Propagation:'shared'}])expect(()=>assertObservationMounts(before,[...before,m],attachment)).toThrow();
 expect(()=>assertObservationMounts(before,[mount],attachment)).toThrow();expect(()=>assertObservationMounts(before,before,null)).not.toThrow();
 expect(()=>observationVolume({...attachment,source:'/tmp/unsafe'})).toThrow();expect(observationVolume(attachment).bind.create_host_path).toBe(false);
});
it('adds only the exact private config path and refuses unrelated environment changes',()=>{
 const before=['LOOPLABS_DEPLOYMENT_PROFILE=isolated-control-demo-1','ROLE=web'],next=webProfileEnvironment(before,'isolated-control-demo-1',true,true);expect(next.LOOPLABS_AWS_AUTHORIZATION_CONFIG).toBe(observationConfig);
 expect(()=>assertProfileOnlyChange(before,Object.entries(next).map(([k,v])=>k+'='+v),'isolated-control-demo-1',true,true)).not.toThrow();
 expect(()=>assertProfileOnlyChange(before,Object.entries({...next,ROLE:'owner'}).map(([k,v])=>k+'='+v),'isolated-control-demo-1',true,true)).toThrow();expect(()=>webProfileEnvironment(before,'isolated-control-demo-1',false,true)).toThrow();
});
