import {expect,it} from "vitest";
import {recordCatalog} from "./catalog";
const one={version:"record-scope-1",workspaceId:"one",contactId:"2001",recipient:"alice@example.test"};
it("lists only configured workspace records with stable opaque keys",()=>{
 const raw=JSON.stringify({records:[one,{...one,workspaceId:"two"}]});const a=recordCatalog("one",raw);expect(a).toHaveLength(1);expect(a[0].scope).toEqual(one);expect(a[0].key).toMatch(/^[a-f0-9]{64}$/);expect(recordCatalog("one",raw)).toEqual(a);expect(recordCatalog("three",raw)).toEqual([]);expect(recordCatalog("one","")).toEqual([]);
});
it("rejects malformed, duplicate and unsafe configured destinations",()=>{
 for(const raw of ["bad","null","[]",JSON.stringify({records:[],url:"http://evil"}),JSON.stringify({records:{}}),JSON.stringify({records:Array(101).fill(one)}),JSON.stringify({records:[one,one]}),JSON.stringify({records:[one,{...one,contactId:"2002"}]}),JSON.stringify({records:[{...one,recipient:"live@example.com"}]}),JSON.stringify({records:[{...one,extra:true}]}),JSON.stringify({records:[{...one,workspaceId:"other",contactId:"1001"}]})])expect(()=>recordCatalog("one",raw)).toThrow();
});
