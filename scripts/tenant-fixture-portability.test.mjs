// Construction-only tests; genuine installed SQL/HTTP suite remains mandatory.
import {test,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const fixture=new URL('../lib/durable/tenant-boundary-prototype.test.ts',import.meta.url),source=readFileSync(fixture,'utf8');
test('base SQL and migration digests resolve exact current repository sources, never a laptop checkout',()=>{
 expect(source).not.toContain('/Users/raj');expect(source).not.toContain('looplabs-research');
 const order=JSON.parse(readFileSync(new URL('../install-order.json',import.meta.url),'utf8'));
 for(const file of order)expect(existsSync(new URL('../../'+file,fixture)),file).toBe(true);
 expect(source).toContain("readFile(new URL('../../'+file,import.meta.url),'utf8')");expect(source).toContain("readFile(new URL('../../'+file,import.meta.url))");
});
test('retained inventory is local45-table policy expectations and includes tenant-sensitive special cases',()=>{
 const inventory=JSON.parse(readFileSync(new URL('../lib/durable/test-fixtures/tenant-base-table-inventory.json',import.meta.url),'utf8'));
 expect(inventory.contract).toBe('tenant-base-table-inventory-1');expect(inventory.tables).toHaveLength(45);expect(new Set(inventory.tables.map(t=>t.table)).size).toBe(45);
 expect(inventory.tables.find(t=>t.table==='ll_actions')).toMatchObject({prototypePolicy:'direct-org'});expect(inventory.tables.find(t=>t.table==='ll_orgs')).toMatchObject({prototypePolicy:'org-id'});
 expect(source).toContain('expect(inventory.tables).toHaveLength(45)');
});
test('fresh process helper resolves repository cwd and real current route consumers',()=>{
 const helper=new URL('./tenant-route-process.ts',import.meta.url);expect(existsSync(helper)).toBe(true);expect(source).toContain("fileURLToPath(new URL('../../scripts/tenant-route-process.ts',import.meta.url))");expect(source).toContain('cwd:repositoryRoot');
 const body=readFileSync(helper,'utf8');expect(body).toContain("from '../lib/workspace/tenant-context'");expect(body).toContain("from '../app/api/workspace/session/route'");expect(body).not.toContain('/Users/raj');expect(fileURLToPath(helper)).toContain('/scripts/tenant-route-process.ts');
});
