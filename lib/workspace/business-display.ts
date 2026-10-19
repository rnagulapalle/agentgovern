import {businessProfile,type CompanyProfile} from './company-profile-contract';
import {workflowDeclaration} from './workflow-catalog';
import type {CloudRuntimeMetadata} from './cloud-runtime-metadata';
/** Display/filter labels only. This never changes membership or execution authority. */
export function businessDisplay(profile:CompanyProfile|null,key:string,metadata?:CloudRuntimeMetadata|null){
 const b=businessProfile(profile,key),companyTeam=b.team,declared=workflowDeclaration(profile,key);
 return {
  team:companyTeam?.name??(declared?.team||metadata?.ownerTeam||null),
  teamId:companyTeam?.id??((declared?.team||metadata?.ownerTeam)?`aws-team:${declared?.team||metadata?.ownerTeam}`:'unassigned'),
  department:b.department?.name??(declared?.department||metadata?.department||null),
  departmentId:b.department?.id??((declared?.department||metadata?.department)?`aws-department:${declared?.department||metadata?.department}`:'unassigned'),
  environment:b.assignment?.environment??metadata?.environment??'unknown',
  purpose:b.assignment?.purpose||declared?.purpose||metadata?.purpose||'',
  source:companyTeam?'Company assigned':declared?'Company declared':metadata?.ownerTeam?'AWS reported':'Not assigned',
 };
}
export function displayScopeMatches(value:ReturnType<typeof businessDisplay>,scope:{department:string;team:string;environment:string}){
 return (scope.department==='all'||scope.department===value.departmentId)&&(scope.team==='all'||scope.team===value.teamId)&&(scope.environment==='all'||scope.environment===value.environment);
}
