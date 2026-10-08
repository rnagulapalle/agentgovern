import {expect,it} from "vitest";
import {savedMessage} from "./presentation";
it("renders the exact saved recipient and content without a template fallback",()=>{
 expect(savedMessage({to:["alice@example.test"],subject:"Original subject",text:"Original message"})).toEqual({recipient:"alice@example.test",subject:"Original subject",text:"Original message"});
 for(const body of [null,{},[],{to:[],subject:"S",text:"T"},{to:["a","b"],subject:"S",text:"T"},{to:[1],subject:"S",text:"T"},{to:[""],subject:"S",text:"T"},{to:["a"],subject:1,text:"T"},{to:["a"],subject:"",text:"T"},{to:["a"],subject:"S",text:null},{to:["a"],subject:"S",text:""}])expect(savedMessage(body)).toBeNull();
});
