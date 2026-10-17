import { expect, test } from "vitest";
import { projectRuntimeMetadata, validStoredRuntimeMetadata } from "./cloud-runtime-metadata";
const declaration={metadataVersion:"3",organization:"Acme",ownerOrganization:"Acme Revenue Operations",ownerTeam:"Sales Support and Quote Operations",environment:"production",onCallStatus:"unassigned"};
test("projects bounded V16 labels separately from company membership and handles older runtimes",()=>{
 const metadata=projectRuntimeMetadata(declaration)!;
 expect(metadata).toMatchObject({...declaration,schemaVersion:"1",source:"aws-runtime-declaration"});
 expect(validStoredRuntimeMetadata(metadata)).toBe(true);
 expect(validStoredRuntimeMetadata(Object.fromEntries(Object.entries(metadata).reverse()))).toBe(true);
 for(const value of [undefined,null,[],{},"private"]){expect(projectRuntimeMetadata(value)).toBeNull();}
 expect(projectRuntimeMetadata({organization:"Acme"})).toMatchObject({ownerTeam:null,environment:null,onCallStatus:null});
});
test("rejects injected authority and drops malformed or sensitive labels rather than treating them as facts",()=>{
 expect(projectRuntimeMetadata({...declaration,permissions:["*"]})).toBeNull();
 for(const ownerTeam of ["xoxb-private","Bearer private","<script>alert(1)</script>","private@example.test","a".repeat(161),{},"bad\nlabel"]){
  expect(projectRuntimeMetadata({...declaration,ownerTeam})?.ownerTeam).toBeNull();
 }
 expect(projectRuntimeMetadata({...declaration,environment:"prod-admin",onCallStatus:"oncall@example.test",metadataVersion:"latest"})).toMatchObject({environment:null,onCallStatus:null,metadataVersion:null});
 expect(validStoredRuntimeMetadata({...projectRuntimeMetadata(declaration),permissions:["*"]})).toBe(false);
 expect(validStoredRuntimeMetadata({...projectRuntimeMetadata(declaration),source:"company-authority"})).toBe(false);
});
test('retains explicit owner/department/purpose without changing legacy declarations or admitting authority',()=>{
 const v=projectRuntimeMetadata({...declaration,owner:'Raj',department:'Sales',purpose:'Prepare customer quotes'})!;
 expect(v).toMatchObject({schemaVersion:'2',owner:'Raj',department:'Sales',purpose:'Prepare customer quotes'});expect(validStoredRuntimeMetadata(v)).toBe(true);
 expect(validStoredRuntimeMetadata({...v,schemaVersion:'1'})).toBe(false);
 expect(projectRuntimeMetadata({...declaration,owner:'<script>',department:'Finance\nAdmin'})?.owner).toBeNull();
 expect(projectRuntimeMetadata({...declaration,owner:'Raj',permissions:['*']})).toBeNull();
 expect(validStoredRuntimeMetadata({...v,extra:'authority'})).toBe(false);
});
