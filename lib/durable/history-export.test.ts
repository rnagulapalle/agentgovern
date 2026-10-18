import { describe, expect, it } from 'vitest';
import { discountHistoryExport } from './history-export';
import type { Snapshot } from './contracts';
const sample = (count: number): Snapshot => ({
 policy: { version: 1, auto_limit: 15, hard_limit: 50 }, agents: [], record: { version: 2, discount: 5 },
 actions: Array.from({length: count}, (_, i) => ({id: `a${i}`,agent_id:'pricing',discount:5,expected_version:1,policy_version:1,state:'succeeded',reason:'Confirmed',payload_hash:'not-an-export-field',lease_token:'private-lease',lease_until:null,approved_by:'reviewer@example.test',approval_until:null,created_at:'2026-10-13T10:00:00Z'})),
 events: Array.from({length: count * 2}, (_, i) => ({id:String(i),action_id:`a${i}`,kind:'verified',subject:'reviewer@example.test',at:'2026-10-13T10:00:00Z'})),
 effects: Array.from({length: count}, (_, i) => ({action_id:`a${i}`,before_discount:0,after_discount:5,after_version:2,recovered:false})),
});
describe('bounded history export', () => {
 it('exports named actors and effects without internal authority fields or unexpected properties', () => {
   const input = sample(1);
   Object.assign(input, {token: 'top-secret'}); Object.assign(input.events[0], {password:'nested-secret'});
   const result = discountHistoryExport(input), text = JSON.stringify(result);
   expect(result.counts).toEqual({actions:1,events:2,effects:1});
   expect(result.actions[0].approvedBy).toBe('reviewer@example.test'); expect(result.events[0].kind).toBe('verified');
   for (const secret of ['top-secret','nested-secret','private-lease','not-an-export-field','lease_token','password']) expect(text).not.toContain(secret);
   expect(result.assurance).toContain('not cryptographically signed');
 });
 it('bounds actions/events, excludes out-of-window effects and does not claim an entire archive', () => {
   const result = discountHistoryExport(sample(120));
   expect(result.counts).toEqual({actions:100,events:200,effects:100});
   expect(result.windowAtLimit).toEqual({actions:true,events:true});
   expect(result.completeness).toContain('not a complete archive');
   expect(result.effects.some(e=>e.actionId==='a119')).toBe(false);
 });
 it('represents empty history without inventing events', () => expect(discountHistoryExport(sample(0)).counts).toEqual({actions:0,events:0,effects:0}));
});
