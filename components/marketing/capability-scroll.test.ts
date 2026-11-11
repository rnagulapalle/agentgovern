import { describe, expect, it } from "vitest";
import { capabilityStage } from "./capability-scroll";
describe("scroll-driven visual chapters",()=>{
 it("keeps the first and final chapters stable outside the pinned range",()=>{
  expect(capabilityStage(-500,400)).toBe(0);
  expect(capabilityStage(4000,400)).toBe(3);
 });
 it("moves forward and backward at the same boundaries, with a full final chapter",()=>{
  expect([0,399,400,799,800,1199,1200,1599].map(d=>capabilityStage(d,400))).toEqual([0,0,1,1,2,2,3,3]);
  expect([1200,1199,800,799,400,399].map(d=>capabilityStage(d,400))).toEqual([3,2,2,1,1,0]);
 });
 it("does not produce an invalid tab from malformed layout measurements",()=>{
  for(const pair of [[NaN,400],[400,0],[Infinity,400],[400,Infinity],[-10,-1]])expect(capabilityStage(...pair as [number,number])).toBe(0);
 });
});
