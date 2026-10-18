import {it,expect} from 'vitest';
import {nativeQuoteListenerTarget} from './native-quote-twin';
it('default native fixture remains explicitly loopback without container widening',()=>{expect(nativeQuoteListenerTarget(undefined)).toEqual({hostname:'127.0.0.1',bind:'127.0.0.1',port:0});expect(nativeQuoteListenerTarget(undefined,8019).port).toBe(8019);});
it.each([null,{}, {kind:'owned-disposable-docker',hostname:'public.example',port:9443},{kind:'owned-disposable-docker',hostname:'quote-twin.looplabs.test',port:443},{kind:'owned-disposable-docker',hostname:'quote-twin.looplabs.test',port:9443,bind:'0.0.0.0'}])('refuses nonexact container listener %j',value=>{expect(()=>nativeQuoteListenerTarget(value as never)).toThrow('Exact owned disposable');});
it('does not allow port override with a container descriptor',()=>{expect(()=>nativeQuoteListenerTarget({kind:'owned-disposable-docker',hostname:'quote-twin.looplabs.test',port:9443},9443)).toThrow();});
