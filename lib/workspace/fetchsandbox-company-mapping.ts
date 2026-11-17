/** Configuration preview only. Existing companyDirectory performs the actual
 * authorized/versioned save and fresh scan check. No workflow is executed. */
import fixture from '../../demo-companies/fetchsandbox/company.json';
import mapping from '../../demo-companies/fetchsandbox/workflow-map.json';
import {parseCompanyProfile,type CompanyProfile,type WorkflowDeclaration} from './company-profile-contract';
export type FetchSandboxObservedDeployment={name:string;connectionId:string;resourceArn:string;version:string;executionOwner:string|null};
export function mapFetchSandboxCompany(current:CompanyProfile,observed:FetchSandboxObservedDeployment[]){
 const original=parseCompanyProfile(current),base=parseCompanyProfile(fixture);
 if(!observed.length||observed.length>1000)throw Error('Current saved inventory required.');
 const keys=new Set<string>(),mappedNames=new Set<string>(),mappedTeams=new Map<string,string>();const receipts:{connectionId:string;resourceArn:string;version:string;executionOwner:string|null;referenceDefinitionId:string|null}[]=[];
 const catalog:WorkflowDeclaration[]=[];
 for(const item of observed){
  const key=JSON.stringify([item.connectionId,item.resourceArn]);if(keys.has(key))throw Error('Duplicate deployment reference.');keys.add(key);
  const m=mapping.entries.find(e=>new RegExp('^'+e.runtimeName+'-[a-zA-Z0-9]{10}$').test(item.name));if(!m||m.observedVersion!==item.version||item.resourceArn.split('/').at(-1)!==item.name)throw Error('Unknown or changed deployment requires explicit mapping review.');if(mappedNames.has(m.nativeName))throw Error('Ambiguous runtime family requires explicit review.');mappedNames.add(m.nativeName);mappedTeams.set(key,m.teamId);
  const team=base.teams.find(t=>t.id===m.teamId)!,department=base.departments.find(d=>d.id===team.departmentId)!,person=base.reference!.employees.find(e=>e.id===m.proposedBusinessOwnerId)!;
  const prior=original.catalog?.find(e=>e.connectionId===item.connectionId&&e.resourceArn===item.resourceArn);
  catalog.push({connectionId:item.connectionId,resourceArn:item.resourceArn,version:item.version,title:m.displayName,kind:m.kind as 'workflow'|'operator',owner:person.name,department:department.name,team:team.name,purpose:prior?.purpose||m.displayName,roles:m.declaredRoles??(prior?.version===item.version?prior.roles:[]),source:'company-declared'});
  receipts.push({connectionId:item.connectionId,resourceArn:item.resourceArn,version:item.version,executionOwner:item.executionOwner,referenceDefinitionId:m.referenceDefinitionId});
 }
 // Do not silently remove a saved runtime or assignment when a scan is incomplete.
 if(original.catalog?.some(w=>!keys.has(JSON.stringify([w.connectionId,w.resourceArn]))))throw Error('Saved catalog is missing from this inventory. Refresh and review before cutover.');
 const assignments=original.assignments.map(a=>{const teamId=mappedTeams.get(a.agentKey);return teamId?{...a,teamId}:a;});
 const extraTeams=original.teams.filter(t=>assignments.some(a=>a.teamId===t.id)&&!base.teams.some(b=>b.id===t.id));
 const extraDepartments=original.departments.filter(d=>extraTeams.some(t=>t.departmentId===d.id)&&!base.departments.some(b=>b.id===d.id));
 for(const t of original.teams)if(assignments.some(a=>a.teamId===t.id)&&base.teams.some(b=>b.id===t.id&&JSON.stringify(b)!==JSON.stringify(t)))throw Error('Team identifier collision needs explicit review.');
 const profile=parseCompanyProfile({...base,revision:original.revision,departments:[...base.departments,...extraDepartments],teams:[...base.teams,...extraTeams],assignments,catalog});
 return {profile,receipts,executionChanges:0,permissionChanges:0,requiresFreshScanSave:true};
}
