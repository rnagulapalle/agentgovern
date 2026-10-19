/** Business directory only. None of these fields grants tool or approval authority. */
export type CompanyDepartment = { id: string; name: string; businessUnit: string };
export type CompanyTeam = { id: string; name: string; departmentId: string };
export type AgentBusinessProfile = { agentKey: string; teamId: string | null; purpose: string; environment: "unknown" | "production" | "staging" | "sandbox" };
export type WorkflowDeclaration = { connectionId:string; resourceArn:string; version:string; title:string; kind:"workflow"|"operator"; owner:string; department:string; team:string; purpose:string; roles:string[]; source:"company-declared" };
export type CompanyProfile = { name: string; revision: number; departments: CompanyDepartment[]; teams: CompanyTeam[]; assignments: AgentBusinessProfile[]; catalog?:WorkflowDeclaration[] };
export type CompanySnapshot = { installed: boolean; profile: CompanyProfile | null; members: { name: string; email: string }[] };
export const emptyCompanyProfile = (): CompanyProfile => ({ name: "", revision: 0, departments: [], teams: [], assignments: [] });
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const keys = (v: Record<string, unknown>, expected: string[]) => Object.keys(v).sort().join() === expected.sort().join();
const text = (v: unknown, max: number, empty = false): v is string => typeof v === "string" && v.trim() === v && (empty || !!v) && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
const id = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(v);
export function parseCompanyProfile(value: unknown): CompanyProfile {
 const fail = (): never => { throw Error("Enter a valid company directory. Business metadata cannot change permissions."); };
 if (!object(value) || !(keys(value,["name","revision","departments","teams","assignments"])||keys(value,["name","revision","departments","teams","assignments","catalog"])) || !text(value.name,100) || !Number.isSafeInteger(value.revision) || Number(value.revision)<0 || !Array.isArray(value.departments) || value.departments.length>100 || !Array.isArray(value.teams) || value.teams.length>500 || !Array.isArray(value.assignments) || value.assignments.length>1000) return fail();
 const departments=value.departments,teams=value.teams,assignments=value.assignments;
 if(departments.some(d=>!object(d)||!keys(d,["id","name","businessUnit"])||!id(d.id)||!text(d.name,100)||!text(d.businessUnit,100,true))||new Set(departments.map(d=>d.id)).size!==departments.length) return fail();
 if(teams.some(t=>!object(t)||!keys(t,["id","name","departmentId"])||!id(t.id)||!text(t.name,100)||!departments.some(d=>d.id===t.departmentId))||new Set(teams.map(t=>t.id)).size!==teams.length)return fail();
 if(assignments.some(a=>!object(a)||!keys(a,["agentKey","teamId","purpose","environment"])||!text(a.agentKey,1300)||!text(a.purpose,500,true)||!(a.teamId===null||teams.some(t=>t.id===a.teamId))||!["unknown","production","staging","sandbox"].includes(String(a.environment)))||new Set(assignments.map(a=>a.agentKey)).size!==assignments.length)return fail();
 if(value.catalog!==undefined){
  if(!Array.isArray(value.catalog)||value.catalog.length>1000||value.catalog.some(w=>!object(w)||!keys(w,["connectionId","resourceArn","version","title","kind","owner","department","team","purpose","roles","source"])||!id(w.connectionId)||!text(w.resourceArn,1024)||!/^arn:aws:bedrock-agentcore:[a-z]{2}-[a-z]+-[1-9]:[0-9]{12}:runtime\/[a-zA-Z][a-zA-Z0-9_]{0,47}-[a-zA-Z0-9]{10}$/.test(w.resourceArn)||typeof w.version!=="string"||! /^[1-9][0-9]{0,4}$/.test(w.version)||!text(w.title,160)||!["workflow","operator"].includes(String(w.kind))||!text(w.owner,160,true)||!text(w.department,100,true)||!text(w.team,100,true)||!text(w.purpose,500,true)||w.source!=="company-declared"||!Array.isArray(w.roles)||w.roles.length>100||w.roles.some(r=>!text(r,100))||new Set(w.roles).size!==w.roles.length||w.kind==="operator"&&w.roles.length>0)||new Set(value.catalog.map(w=>JSON.stringify([w.connectionId,w.resourceArn]))).size!==value.catalog.length)return fail();
 }
 return JSON.parse(JSON.stringify(value)) as CompanyProfile;
}
export function businessProfile(profile:CompanyProfile|null,agentKey:string){const assignment=profile?.assignments.find(a=>a.agentKey===agentKey)??null;const team=profile?.teams.find(t=>t.id===assignment?.teamId)??null;const department=profile?.departments.find(d=>d.id===team?.departmentId)??null;return {assignment,team,department};}
export function businessScopeMatches(profile:CompanyProfile|null,agentKey:string,scope:{department:string;team:string;environment:string}){const b=businessProfile(profile,agentKey);return(scope.department==="all"||b.department?.id===scope.department||scope.department==="unassigned"&&!b.department)&&(scope.team==="all"||b.team?.id===scope.team||scope.team==="unassigned"&&!b.team)&&(scope.environment==="all"||(b.assignment?.environment??"unknown")===scope.environment);}

export function workflowDeclaration(profile:CompanyProfile|null,key:string,version?:string){return profile?.catalog?.find(w=>JSON.stringify([w.connectionId,w.resourceArn])===key&&(!version||w.version===version))??null;}
