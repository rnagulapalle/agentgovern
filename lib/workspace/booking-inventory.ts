/** Optional inventory composition only. This does not grant privileges or admit
 * a runtime. The caller still owns source provenance and catalog collection. */
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {bookingColumns} from './booking-installation';
import {verifyTenantInventory} from './tenant-read-inventory';

export async function verifyBookingTenantInventory(
 actual:Parameters<typeof verifyTenantInventory>[0],
 reviewedBase:Parameters<typeof verifyTenantInventory>[1],
) {
 const fail=()=>{throw Error('Reviewed booking inventory mismatch');};
 if(!actual||!Array.isArray(actual.tables)||!Array.isArray(actual.migrations)||!Array.isArray(reviewedBase)||reviewedBase.some(m=>m.version===32))fail();
 const names=Object.keys(bookingColumns);
 const extension=actual.tables.filter(t=>names.includes(t?.name));
 if(extension.length!==names.length||new Set(extension.map(t=>t.name)).size!==names.length)fail();
 for(const row of extension){
  const columns=bookingColumns[row.name as keyof typeof bookingColumns];
  if(Object.keys(row).sort().join()!=='columns,force,name,rls'||row.rls!==true||row.force!==true||JSON.stringify(row.columns)!==JSON.stringify(columns))fail();
 }
 const migrations=actual.migrations.filter(m=>m?.version===32);
 const digest=createHash('sha256').update(await readFile('lib/workspace/booking-schema.sql')).digest('hex');
 if(migrations.length!==1||Object.keys(migrations[0]).sort().join()!=='digest,version'||migrations[0].digest!==digest)fail();
 // Preserve the base checker and its frozen allowlists. Only this exact optional
 // extension is removed, and the caller's reviewed base ledger stays authoritative.
 verifyTenantInventory({tables:actual.tables.filter(t=>!names.includes(t?.name)),migrations:actual.migrations.filter(m=>m?.version!==32)},reviewedBase);
}
