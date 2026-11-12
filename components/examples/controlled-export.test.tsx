import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe,it,expect } from "vitest";
import { readFileSync } from "node:fs";
import { ControlledExportExample } from "./controlled-export";
import { deploymentRouteDecision } from "@/lib/workspace/deployment-capabilities";
import copy from "@/lib/marketing-export-example-copy.json";
import policyCopy from "@/lib/marketing-export-policy-copy.json";

describe("preserved export widget and legacy route boundary",()=>{
 it("offers actual controls with one heading and visible browser/sample scope",()=>{
  const html=renderToStaticMarkup(createElement(ControlledExportExample));
  expect(html.match(/<h1/g)).toHaveLength(1);
  expect(html).toContain('id="export-rows"');
  expect(html).toContain('type="range"');
  expect(html).toContain('max="5000"');
  expect(html).toContain(copy.example.scopeNote);
  expect(html).toContain(policyCopy.policyBody);
  expect(html).not.toMatch(/live client|cryptographic|LoopLabs ledger/);
  for(const standard of ["FERPA","HIPAA"])expect(html).not.toMatch(new RegExp([standard,"compliant"].join(" "),"i"));
 });
 it("does not open private workspaces or use a privileged route for the example",()=>{
  expect(deploymentRouteDecision('isolated-control-demo-1','/examples','GET')).toBe('allow');
  expect(readFileSync('app/examples/controlled-export/page.tsx','utf8')).toContain('redirect("/examples")');
  expect(deploymentRouteDecision('isolated-control-demo-1','/api/workspace/actions','POST')).toBe('deny');
  const gate=readFileSync('app/control-plane/layout.tsx','utf8');
  expect(gate).toContain('if (!context) return <WorkspaceGate />');
  const component=readFileSync('components/examples/controlled-export.tsx','utf8');
  expect(component).not.toMatch(/fetch\(|\/api\/|localStorage|sessionStorage|useSimulation/);
 });
});
