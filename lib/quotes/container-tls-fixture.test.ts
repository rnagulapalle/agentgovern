import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {X509Certificate} from 'node:crypto';
import {createTlsFixture} from './tls.test-fixture';
it.each(['quote-twin.looplabs.test','quote-email.looplabs.test'] as const)('owned fixture certificate explicitly binds %s without weakening loopback',async hostname=>{const tls=await createTlsFixture({ownedContainerHostname:hostname});try{const leaf=new X509Certificate(await readFile(join(tls.dir,'cert.pem')));expect(leaf.checkHost(hostname)).toBe(hostname);expect(leaf.checkIP('127.0.0.1')).toBe('127.0.0.1');expect(leaf.checkHost('unrelated.example')).toBeUndefined();expect(leaf.ca).toBe(false);}finally{await tls.close();}});
it('refuses arbitrary published hostnames and extra scope fields before allocating TLS',async()=>{await expect(createTlsFixture({ownedContainerHostname:'public.example'} as never)).rejects.toThrow();await expect(createTlsFixture({ownedContainerHostname:'quote-twin.looplabs.test',bind:'0.0.0.0'} as never)).rejects.toThrow();});
