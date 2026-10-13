import {expect,it} from 'vitest';
import {installChatProofRoles} from './chat-ui-installed-fixture';
const input={url:'postgres://fixture:never-used@localhost/postgres',schema:'owned_test',generation:'/tmp/never-allocated-proof',epoch:'00000000-0000-4000-8000-000000000001',installation:'proof',seed:async()=>{throw Error('Seed must not run');}};
it('refuses plaintext transport before opening an owner connection',async()=>{await expect(installChatProofRoles({...input,transport:{mode:'loopback-plaintext-test-fixture',fixture:'disposable-local-postgres'}})).rejects.toThrow('Verified TLS required');});
it('refuses remote targets even with supplied TLS policy before allocation',async()=>{await expect(installChatProofRoles({...input,url:'postgres://fixture:never-used@example.test/postgres',transport:{mode:'verified-tls',trust:'standard'}})).rejects.toThrow('Owned loopback target required');});
