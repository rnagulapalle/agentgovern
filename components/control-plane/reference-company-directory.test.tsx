import {expect,it} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import fixture from "../../demo-companies/fetchsandbox/company.json";
import {parseCompanyProfile} from "../../lib/workspace/company-profile-contract";
import {ReferenceCompanyDirectory} from "./reference-company-directory";
it("renders the declared business and its limits without claiming execution",()=>{
 const html=renderToStaticMarkup(<ReferenceCompanyDirectory profile={parseCompanyProfile(fixture)}/>);
 expect(html).toContain("240 employees");expect(html).toContain("32 workflow definitions");expect(html).toContain("No execution binding");expect(html).toContain("execution not connected");expect(html).not.toMatch(/acme/i);
 expect(html).toContain(fixture.reference.workflows[0].name);expect(html).toContain(fixture.reference.employees[0].name);
});
it("adds no reference directory to existing or unavailable companies",()=>{
 expect(renderToStaticMarkup(<ReferenceCompanyDirectory profile={null}/>)).toBe("");
 expect(renderToStaticMarkup(<ReferenceCompanyDirectory profile={{name:"Existing",revision:0,departments:[],teams:[],assignments:[]}}/>)).toBe("");
});
