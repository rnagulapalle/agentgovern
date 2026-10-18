import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import {RecordsWorkspace} from "./records-workspace";
it("explains record boundaries without exposing developer payloads or execution authority",()=>{
 const html=renderToStaticMarkup(createElement(RecordsWorkspace));expect(html).toContain("Records and access");expect(html).toContain("No real customer data");expect(html).toContain("does not approve an action or start a workflow");expect(html).toContain("Refresh saved access");expect(html).not.toContain("Approve exact action");expect(html).not.toContain("PostgreSQL");expect(html).not.toContain("<pre");
});
