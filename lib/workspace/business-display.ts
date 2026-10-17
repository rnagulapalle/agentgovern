import {businessProfile,type CompanyProfile} from './company-profile-contract';
import type {CloudRuntimeMetadata} from './cloud-runtime-metadata';
/** Display/filter labels only. This never changes membership or execution authority. */
export function businessDisplay(profile:CompanyProfile|null,key:string,metadata?:CloudRuntimeMetadata|null){
 const b=businessProfile(profile,key),companyTeam=b.team;
 return {
  team:companyTeam?.name??metadata?.ownerTeam??null,
  teamId:companyTeam?.id??(metadata?.ownerTeam?`aws-team:${metadata.ownerTeam}`:'unassigned'),
  department:b.department?.name??metadata?.department??null,
  departmentId:b.department?.id??(metadata?.department?`aws-department:${metadata.department}`:'unassigned'),
  environment:b.assignment?.environment??metadata?.environment??'unknown',
  purpose:b.assignment?.purpose||metadata?.purpose||'',
  source:companyTeam?'Company assigned':metadata?.ownerTeam?'AWS reported':'Not assigned',
 };
}
export function displayScopeMatches(value:ReturnType<typeof businessDisplay>,scope:{department:string;team:string;environment:string}){
 return (scope.department==='all'||scope.department===value.departmentId)&&(scope.team==='all'||scope.team===value.teamId)&&(scope.environment==='all'||scope.environment===value.environment);
}
