import {expect,it} from "vitest";
import fixture from "../../demo-companies/fetchsandbox/company.json";
import {parseCompanyProfile} from "./company-profile-contract";
const company=()=>structuredClone(fixture);
it("validates the versioned FetchSandbox business without granting execution",()=>{
 const result=parseCompanyProfile(company());
 expect(result.name).toBe("FetchSandbox");
 expect(result.reference?.employees).toHaveLength(240);
 expect(result.departments).toHaveLength(12);expect(result.teams).toHaveLength(24);
 expect(result.reference?.tools).toHaveLength(24);expect(result.reference?.infrastructure).toHaveLength(12);
 expect(result.reference?.workflows).toHaveLength(32);expect(result.assignments).toEqual([]);expect(result.catalog).toBeUndefined();
 expect(JSON.stringify(result)).not.toMatch(/acme/i);
 expect(result.reference?.workflows.every(w=>w.state==="declared"&&w.executionBinding===null)).toBe(true);
 expect(result.reference?.tools.every(t=>t.binding==="unbound"&&t.mode==="simulated")).toBe(true);
});
it.each(["version","provenance","partner","unknown-root","company-name","duplicate-person","duplicate-email","foreign-team","foreign-manager","manager-cycle","real-email","secret-field","foreign-tool-owner","inactive-owner","live-tool","bound-tool","foreign-infra-owner","production-infra","unknown-infra-kind","duplicate-tool","duplicate-infra","duplicate-workflow","foreign-workflow-team","foreign-workflow-owner","self-review","foreign-reviewer","no-reviewer","duplicate-reviewer","unknown-tool","duplicate-workflow-tool","no-tool","no-action","executing","bound-workflow","oversize","whitespace"])("refuses invalid or authority-bearing company context: %s",kind=>{
 const value=company(),r=value.reference;
 const e=r.employees[0],tool=r.tools[0],infra=r.infrastructure[0],w=r.workflows[0];
 switch(kind){
 case "version":r.version="other";break;case "provenance":r.provenance="real-company";break;case "partner":r.controlPlanePartner="other";break;
 case "unknown-root":Object.assign(r,{token:"not-a-real-token"});break;case "company-name":value.name="Other";break;
 case "duplicate-person":r.employees.push(e);break;case "duplicate-email":r.employees[1].email=e.email;break;case "foreign-team":e.teamId="missing";break;
 case "foreign-manager":e.managerId="missing";break;case "manager-cycle":e.managerId=e.id;break;case "real-email":e.email="person@example.com";break;
 case "secret-field":Object.assign(tool,{apiKey:"not-a-real-token"});break;case "foreign-tool-owner":tool.ownerId="missing";break;
 case "inactive-owner":r.employees.find(p=>p.id===tool.ownerId)!.status="departed";break;
 case "live-tool":tool.mode="live";break;case "bound-tool":tool.binding="connected";break;
 case "foreign-infra-owner":infra.ownerId="missing";break;case "production-infra":infra.environment="production";break;case "unknown-infra-kind":infra.kind="unknown";break;
 case "duplicate-tool":r.tools.push(tool);break;case "duplicate-infra":r.infrastructure.push(infra);break;case "duplicate-workflow":r.workflows.push(w);break;
 case "foreign-workflow-team":w.teamId="missing";break;case "foreign-workflow-owner":w.ownerId="missing";break;
 case "self-review":w.reviewerIds=[w.ownerId];break;case "foreign-reviewer":w.reviewerIds=["missing"];break;case "no-reviewer":w.reviewerIds=[];break;
 case "duplicate-reviewer":w.reviewerIds.push(w.reviewerIds[0]);break;case "unknown-tool":w.toolIds=["missing"];break;
 case "duplicate-workflow-tool":w.toolIds.push(w.toolIds[0]);break;case "no-tool":w.toolIds=[];break;case "no-action":w.actions=[];break;
 case "executing":w.state="running";break;case "bound-workflow":Object.assign(w,{executionBinding:"native"});break;
 case "oversize":value.departments.forEach(d=>d.businessUnit="界".repeat(100));r.employees.forEach(p=>{p.name="界".repeat(160);p.title="界".repeat(160)});break;
 case "whitespace":e.name=" untrimmed ";break;
 }
 expect(()=>parseCompanyProfile(value)).toThrow();
});
it("returns detached data and preserves existing directories without a reference company",()=>{
 const value=company(),parsed=parseCompanyProfile(value);value.reference.employees[0].name="Changed";
 expect(parsed.reference!.employees[0].name).not.toBe("Changed");
 const legacy={name:"Historical company",revision:3,departments:[],teams:[],assignments:[]};expect(parseCompanyProfile(legacy)).toEqual(legacy);
});
