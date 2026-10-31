import assert from 'node:assert/strict';
import vm from 'node:vm';
import {execFileSync,spawnSync} from 'node:child_process';
import {ownedBuilder,builderMemoryBytes} from './staging-owned-builder.mjs';
import {readFile} from 'node:fs/promises';
import {describe,it,expect,vi} from 'vitest';
import {publicAnalyticsBuildArguments,parseContainerEnvironment,webProfileEnvironment,composeEnvironment,assertResolvedEnvironment,assertHostConfigurationUnchanged,assertProfileOnlyChange,changedControlDemoSource,assertPublicFooterDestinations,plannerRefreshOverride,withRenewalLock} from './control-demo-web-release.mjs';
describe('bounded existing-installation control demo release',()=>{
 it('changes only reviewed profile; rejects changed secrets, absent authority and unknown old profiles',()=>{
  const before=['LOOPLABS_DEPLOYMENT_PROFILE=isolated-quote-demo-1','TOKEN=private-test-value','ROLE=role1'];
  const after=['ROLE=role1','LOOPLABS_DEPLOYMENT_PROFILE=isolated-control-demo-1','TOKEN=private-test-value'];
  expect(()=>assertProfileOnlyChange(before,after,'isolated-control-demo-1')).not.toThrow();
  for(const invalid of [after.filter(x=>!x.startsWith('TOKEN=')),after.map(x=>x.startsWith('TOKEN=')?'TOKEN=changed':x),after.map(x=>x.startsWith('LOOPLABS_')?'LOOPLABS_DEPLOYMENT_PROFILE=legacy':x)])expect(()=>assertProfileOnlyChange(before,invalid,'isolated-control-demo-1')).toThrow();
  expect(()=>assertProfileOnlyChange(['LOOPLABS_DEPLOYMENT_PROFILE=legacy'],after,'isolated-control-demo-1')).toThrow();
 });
 it('rejects duplicate, missing and prototype environment entries before compose activation',()=>{
  for(const entries of [null,[],['TOKEN'],['=value'],['TOKEN=a','TOKEN=b'],['__proto__=x'],['BAD-KEY=x'],['X=bad\0value']])expect(()=>parseContainerEnvironment(entries)).toThrow();
  expect(parseContainerEnvironment(['TOKEN=a=b','EMPTY='])).toEqual({TOKEN:'a=b',EMPTY:''});
  expect(()=>webProfileEnvironment(['TOKEN=only'],'isolated-control-demo-1')).toThrow();
 });
 it('captures refreshed live credentials rather than stale env_file and verifies exact resolved activation and rollback maps',()=>{
  const current=['LOOPLABS_DEPLOYMENT_PROFILE=isolated-quote-demo-1','SESSION=fresh$token=','ROLE=web'];
  const expected=webProfileEnvironment(current,'isolated-control-demo-1');
  expect(expected.SESSION).toBe('fresh$token=');expect(composeEnvironment(expected).SESSION).toBe('fresh$$token=');
  expect(()=>assertResolvedEnvironment({...expected},expected)).not.toThrow();
  for(const resolved of [{...expected,SESSION:'old'}, {...expected,UNEXPECTED:'x'}, {...expected,ROLE:null}, {LOOPLABS_DEPLOYMENT_PROFILE:expected.LOOPLABS_DEPLOYMENT_PROFILE}])expect(()=>assertResolvedEnvironment(resolved,expected)).toThrow();
  expect(()=>assertResolvedEnvironment(parseContainerEnvironment(current),parseContainerEnvironment(current))).not.toThrow();
 });
 it('preserves complete host security/resource/DNS configuration while tolerating mount ordering only',()=>{
  const old={PortBindings:{3000:[{HostIp:'127.0.0.1',HostPort:'3199'}]},ReadonlyRootfs:true,CapDrop:['ALL'],SecurityOpt:['no-new-privileges:true'],Memory:1024,Dns:['127.0.0.11'],RestartPolicy:{Name:'unless-stopped'},Binds:['b','a'],Mounts:[{Target:'/b',ReadOnly:true},{Target:'/a',ReadOnly:true}]};
  const same={...structuredClone(old),Binds:['a','b'],Mounts:[...old.Mounts].reverse()};expect(()=>assertHostConfigurationUnchanged(old,same)).not.toThrow();
  for(const change of [{Memory:2048},{ReadonlyRootfs:false},{CapDrop:[]},{SecurityOpt:[]},{Dns:[]},{RestartPolicy:{Name:'no'}},{AddedSetting:true}])expect(()=>assertHostConfigurationUnchanged(old,{...same,...change})).toThrow();
 });
 it('records exact changed and deleted source files and rejects unexplained file modes or empty successor',()=>{
  const a={sourceHashes:{a:'1',b:'1'},sourceFileModes:{a:420,b:420}},b={sourceHashes:{a:'2',c:'3'},sourceFileModes:{a:420,c:420}};
  expect(changedControlDemoSource(a,b)).toEqual(['a','b','c']);
  expect(()=>changedControlDemoSource(a,{...b,sourceFileModes:{a:511,c:420}})).toThrow();expect(()=>changedControlDemoSource(a,a)).toThrow();
 });
 it('retains only exact original private web IPs and refuses missing, extra or public networks',()=>{
  const project='ll-platform-0123456789ab',web={Image:'sha256:'+'a'.repeat(64),NetworkSettings:{Networks:{[project+'_application']:{IPAddress:'172.20.0.2'},[project+'_egress']:{IPAddress:'172.21.0.2'}}}};
  expect(plannerRefreshOverride(web,project)).toEqual({services:{web:{image:web.Image,networks:{application:{ipv4_address:'172.20.0.2'},egress:{ipv4_address:'172.21.0.2'}}}}});
  const bad=structuredClone(web);bad.NetworkSettings.Networks[project+'_egress'].IPAddress='8.8.8.8';expect(()=>plannerRefreshOverride(bad,project)).toThrow();delete bad.NetworkSettings.Networks[project+'_egress'];expect(()=>plannerRefreshOverride(bad,project)).toThrow();
 });
 it('keeps unsupported footer destinations unavailable',()=>{
  expect(()=>assertPublicFooterDestinations('<footer><a href="/control-plane/agents">Agents</a></footer>')).not.toThrow();
  expect(()=>assertPublicFooterDestinations('<footer><a href="/control-plane/discovery">Cloud</a></footer>')).toThrow();
 });
 it('uses the shared renewal lock, releases after success or verified rollback, retains ambiguous rollback and never steals a lock',async()=>{
  const io={privateDir:vi.fn(async()=>{}),mkdir:vi.fn(async()=>{}),rm:vi.fn(async()=>{})},root='/srv/looplabs-production/config';
  expect(await withRenewalLock(root,async()=>7,io)).toBe(7);expect(io.mkdir).toHaveBeenCalledWith(root+'/temporal-renewal.lock',{mode:0o700});expect(io.rm).toHaveBeenCalledOnce();
  io.rm.mockClear();await expect(withRenewalLock(root,async()=>{throw Error('verified rollback');},io)).rejects.toThrow();expect(io.rm).toHaveBeenCalledOnce();
  io.rm.mockClear();await expect(withRenewalLock(root,async()=>{throw Object.assign(Error('ambiguous rollback'),{rollbackFailed:true});},io)).rejects.toThrow();expect(io.rm).not.toHaveBeenCalled();
  io.mkdir.mockRejectedValueOnce(Object.assign(Error('busy'),{code:'EEXIST'}));const operation=vi.fn();await expect(withRenewalLock(root,operation,io)).rejects.toThrow();expect(operation).not.toHaveBeenCalled();expect(io.rm).not.toHaveBeenCalled();
 });
 it('entry preserves default gate, refuses dirty/unpushed source and gates before SSH; activation is web-only with explicit rollback',async()=>{
  const shell=await readFile(new URL('./deploy-control-demo.sh',import.meta.url),'utf8'),deploy=await readFile(new URL('../deploy.sh',import.meta.url),'utf8'),source=await readFile(new URL('./control-demo-web-release.mjs',import.meta.url),'utf8');
  expect(shell).not.toContain('pnpm quality');assert(shell.indexOf('node scripts/release-ci.mjs')<shell.indexOf('ssh "${SSH_ARGS[@]}"'));expect(shell).toContain('git branch --show-current)" == main');expect(shell).toContain('git rev-parse origin/main');expect(shell).toContain('git status --porcelain --untracked-files=all');expect(deploy).toContain('scripts/release-gate.sh');expect(deploy).toContain('scripts/deploy-quote-demo.sh');
  expect(source).toContain("compose(overrideFile,'up','-d','--no-deps','--no-build','--pull','never','--force-recreate','web')");expect(source).toContain("compose(rollbackFile,'up','-d','--no-deps','--no-build','--pull','never','--force-recreate','web')");expect(source).toContain('assert.equal(await readlink(livePointer),liveTarget)');expect(source).toContain('oldApproval=await readInstalledApprovalAttachment(old.Mounts)');expect(source).toContain('workflowEffectsProved:false');
 });
});

it('explicit AWS UX release enables only the named flag and preserves exact rollback authority',()=>{
 const before=['LOOPLABS_DEPLOYMENT_PROFILE=isolated-control-demo-1','SESSION=private-test-session','ROLE=web'];
 const next=webProfileEnvironment(before,'isolated-control-demo-1',true);
 expect(next).toEqual({...parseContainerEnvironment(before),LOOPLABS_AWS_CONNECTIONS:'enabled'});
 expect(()=>assertProfileOnlyChange(before,Object.entries(next).map(([k,v])=>k+'='+v),'isolated-control-demo-1',true)).not.toThrow();
 expect(()=>assertProfileOnlyChange(before,Object.entries({...next,ROLE:'owner'}).map(([k,v])=>k+'='+v),'isolated-control-demo-1',true)).toThrow();
 expect(()=>assertProfileOnlyChange(before,Object.entries(next).map(([k,v])=>k+'='+v),'isolated-control-demo-1')).toThrow();
 expect(webProfileEnvironment(before,'isolated-control-demo-1')).toEqual(parseContainerEnvironment(before));
 expect(()=>webProfileEnvironment(before,'isolated-control-demo-1','enabled')).toThrow();
 expect(()=>webProfileEnvironment(before,'isolated-quote-demo-1',true)).toThrow();
});

const publicProjectKey='phc_'+'a'.repeat(32);
it('passes only explicit public project configuration through the actual owned builder call',async()=>{
 const analyticsArgs=publicAnalyticsBuildArguments({NEXT_PUBLIC_POSTHOG_KEY:publicProjectKey,PRIVATE_TOKEN:'must-not-forward'});
 const source=await readFile(new URL('./control-demo-web-release.mjs',import.meta.url),'utf8');
 const start=source.indexOf('builder.build('),call=source.slice(start,source.indexOf(';const image=',start));
 const calls=[],docker=(...args)=>{calls.push(args);return args[0]==='inspect'?JSON.stringify({Memory:builderMemoryBytes,MemorySwap:builderMemoryBytes}):'';};
 const builder=ownedBuilder(docker,'ll-platform-0123456789ab-build');builder.start();
 vm.runInNewContext(call,{builder,analyticsArgs,commit:'a'.repeat(40),sourceSha:'b'.repeat(64),tag:'synthetic-nonexecuting-evaluation'},{timeout:1000});builder.close();
 const build=calls.find(args=>args[0]==='buildx'&&args[1]==='build');
 expect(build.filter(x=>x==='--build-arg')).toHaveLength(2);
 expect(build).toContain('NEXT_PUBLIC_POSTHOG_KEY='+publicProjectKey);expect(build).toContain('NEXT_PUBLIC_POSTHOG_HOST=/ph');
 expect(build.join(' ')).not.toContain('must-not-forward');expect(build.join(' ')).not.toContain('PRIVATE_TOKEN');
});
it('refuses missing, malformed and shell-active public values and unreviewed collection hosts',()=>{
 for(const key of [undefined,'','server-secret','phc_short','phc_'+'a'.repeat(129),publicProjectKey+"';touch /tmp/unsafe;#",publicProjectKey+'\n',123])expect(()=>publicAnalyticsBuildArguments({NEXT_PUBLIC_POSTHOG_KEY:key})).toThrow();
 for(const host of ['', 'https://unreviewed.example', '/ph?token=private',123])expect(()=>publicAnalyticsBuildArguments({NEXT_PUBLIC_POSTHOG_KEY:publicProjectKey,NEXT_PUBLIC_POSTHOG_HOST:host})).toThrow();
});
it('validates both release boundaries without printing rejected configuration',async()=>{
 const file=new URL('./control-demo-web-release.mjs',import.meta.url),env={PATH:process.env.PATH,NEXT_PUBLIC_POSTHOG_KEY:publicProjectKey};
 expect(execFileSync(process.execPath,[file.pathname,'analytics-check'],{env,encoding:'utf8'})).toBe('');
 const rejected='private-do-not-print',result=spawnSync(process.execPath,[file.pathname,'analytics-check'],{env:{...env,NEXT_PUBLIC_POSTHOG_KEY:rejected},encoding:'utf8'});
 expect(result.status).toBe(1);expect(result.stdout+result.stderr).not.toContain(rejected);
 const shell=await readFile(new URL('./deploy-control-demo.sh',import.meta.url),'utf8');
 expect(shell.indexOf('analytics-check')).toBeLessThan(shell.indexOf('node scripts/release-ci.mjs'));
 expect(shell).toContain("NEXT_PUBLIC_POSTHOG_KEY='$NEXT_PUBLIC_POSTHOG_KEY' NEXT_PUBLIC_POSTHOG_HOST='$NEXT_PUBLIC_POSTHOG_HOST' node --import tsx scripts/control-demo-web-release.mjs build");
 expect(shell).toContain('readonly NEXT_PUBLIC_POSTHOG_KEY NEXT_PUBLIC_POSTHOG_HOST');
});
