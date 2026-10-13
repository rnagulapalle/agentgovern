import {expect,it} from "vitest";
import {quoteReadMetadata} from "./read-service";
import type {ConnectorAction} from "../connectors/contracts";
it("read-only provider metadata cannot fabricate source, successful effect or verification",async()=>{
 const provider=quoteReadMetadata({contract:"private-quote-twin-1",workspaceId:"one",quoteId:"quote-42",distributorId:"distributor-7",recipient:"buyer@example.test",sender:"sales@example.test",quoteBinding:"a".repeat(64),emailBinding:"b".repeat(64)});
 expect(provider.workspaceId).toBe("one");expect(provider.bindingId).toBe("a".repeat(64));
 await expect(provider.source("quote")).rejects.toMatchObject({status:503});
 await expect(provider.write({} as ConnectorAction,false)).rejects.toMatchObject({status:503});
 await expect(provider.inspect({} as ConnectorAction)).rejects.toMatchObject({status:503});
});
