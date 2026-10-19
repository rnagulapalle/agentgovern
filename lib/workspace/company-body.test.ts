import {it,expect} from 'vitest';
import {NextRequest} from 'next/server';
import {companyBody} from './company-body';
import {body} from '../durable/http';
const req=(value:string,type='application/json')=>new NextRequest('https://looplabs.run/api/workspace/company',{method:'POST',headers:{'content-type':type},body:value});
it('allows a bounded catalog while ordinary action bodies retain their8KiB limit',async()=>{const json=JSON.stringify({catalog:'x'.repeat(10000)});expect(await companyBody(req(json))).toEqual(JSON.parse(json));await expect(body(req(json))).rejects.toMatchObject({status:413});});
it.each([['x','application/json',400],['[]','application/json',400],['{}','text/plain',415],['x'.repeat(262145),'application/json',413]] as const)('refuses malformed or oversized company body',async(value,type,status)=>{await expect(companyBody(req(value,type))).rejects.toMatchObject({status});});
