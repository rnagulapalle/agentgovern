import { expect, it, vi } from 'vitest';
import { FetchSandboxConnectors } from '../connectors/twin';
import { NativeQuoteEmailTransport, nativeMailIdentity, type NativeMailPin } from './native-email-transport';
import { quoteRequestIdentity } from './effect';

function fixture() {
 const pin:NativeMailPin={quoteRequest:{contract:'quote-conditional-write-1',binding:'a'.repeat(64),method:'PATCH',resource:'/quotes/quote-42',workspaceId:'company-a',sourceVersion:'v3',idempotencyKey:'11111111-1111-4111-8111-111111111111',body:{distributorId:'distributor-7',currency:'USD',subtotalMinor:100000,discountBps:1400,totalMinor:86000}},messageRequest:{contract:'quote-email-request-1',binding:'b'.repeat(64),workspaceId:'company-a',quoteId:'quote-42',method:'POST',resource:'/emails',idempotencyKey:'22222222-2222-4222-8222-222222222222',body:{from:'sales@example.test',to:['customer@example.test'],subject:'Updated quote',text:'Your updated quote total is USD 860.00.'}}};
 const reference='33333333-3333-4333-8333-333333333333';
 const evidence={contract:'quote-email-lookup-1',effect:{contract:'quote-email-effect-1',binding:pin.messageRequest.binding,workspaceId:pin.messageRequest.workspaceId,quoteId:pin.messageRequest.quoteId,actionId:pin.messageRequest.idempotencyKey,requestIdentity:nativeMailIdentity(pin.messageRequest),quoteRequestIdentity:quoteRequestIdentity(pin.quoteRequest),reference,body:structuredClone(pin.messageRequest.body)},currentEmail:{id:reference,...structuredClone(pin.messageRequest.body),last_event:'sent'}};
 const mail=new FetchSandboxConnectors('http://127.0.0.1:8018','a'.repeat(40));
 const request=vi.spyOn(mail,'request').mockImplementation(async()=>evidence);
 const lookup=vi.fn(async()=>null);
 const transport=new NativeQuoteEmailTransport(pin,{lookup},mail);
 return {pin,evidence,mail,request,lookup,transport};
}
it.each(['','\n','x'.repeat(129)])('malformed correlated reference %j never establishes acceptance',async(reference)=>{
 const f=fixture();f.evidence.effect.reference=reference;f.evidence.currentEmail.id=reference;
 expect((await f.transport.inspect(f.pin.messageRequest)).outcome).toBe('unknown');
});
it('exact simulated acceptance remains historical and does not re-send or authorize anything',async()=>{
 const f=fixture();expect(await f.transport.inspect(f.pin.messageRequest)).toMatchObject({outcome:'verified',reference:f.evidence.effect.reference});
 expect(f.lookup).not.toHaveBeenCalled();expect(f.request).toHaveBeenCalledTimes(1);expect(f.request.mock.calls[0][0]).toContain('/quote-email/effects/');
});
it('wrong bound identity and changed physical message cannot appear verified',async()=>{
 const f=fixture();f.evidence.effect.binding='c'.repeat(64);expect((await f.transport.inspect(f.pin.messageRequest)).outcome).toBe('conflict');
 f.evidence.effect.binding=f.pin.messageRequest.binding;f.evidence.currentEmail.text='Changed';expect((await f.transport.inspect(f.pin.messageRequest)).outcome).toBe('conflict');
});
it('incomplete or unavailable readback remains unknown and never resends',async()=>{
 const f=fixture();f.request.mockResolvedValueOnce({contract:'quote-email-lookup-1',effect:{},currentEmail:{}});
 expect((await f.transport.inspect(f.pin.messageRequest)).outcome).toBe('unknown');
 f.request.mockRejectedValueOnce(Error('Unavailable'));expect((await f.transport.inspect(f.pin.messageRequest)).outcome).toBe('unknown');
 expect(f.lookup).not.toHaveBeenCalled();expect(f.request.mock.calls.every(([path])=>path.includes('/effects/'))).toBe(true);
});
it('constructor pins an immutable request independently of caller mutation',async()=>{
 const f=fixture(),original=structuredClone(f.pin.messageRequest);f.pin.messageRequest.body.text='Changed after construction';
 await expect(f.transport.inspect(f.pin.messageRequest)).rejects.toMatchObject({status:403});
 expect((await f.transport.inspect(original)).outcome).toBe('verified');
});
it('missing predecessor holds exact mail before transport POST',async()=>{
 const f=fixture();expect((await f.transport.write(f.pin.messageRequest)).outcome).toBe('unknown');
 expect(f.lookup).toHaveBeenCalledTimes(1);expect(f.request).not.toHaveBeenCalled();
});
it('identity parser rejects accessor or secret-shaped content without treating it as a message',()=>{
 const f=fixture();let reads=0;const accessor={...f.pin.messageRequest};Object.defineProperty(accessor,'binding',{enumerable:true,get(){reads++;return 'b'.repeat(64);}});
 expect(nativeMailIdentity(accessor)).toBe(null);expect(reads).toBe(0);
 expect(nativeMailIdentity({...f.pin.messageRequest,body:{...f.pin.messageRequest.body,text:'api_key=pretend'}})).toBe(null);
});
