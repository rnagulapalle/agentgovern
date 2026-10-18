import assert from 'node:assert/strict';
// Extend an already validated installed database service. Do not copy its
// disposable initdb-on-every-start command into a persistent deployment.
export function persistentDatabaseService(disposable){
 assert(disposable?.read_only===true&&Array.isArray(disposable.command)&&disposable.command.length===1);
 assert.deepEqual(disposable.entrypoint,['sh','-c']);
 const original=disposable.command[0];
 const split=' && postgres -D /owned-pg ';
 assert.equal(original.split(split).length,2,'Exact installed database startup required');
 const [init,tail]=original.split(split);
 assert(init.startsWith('initdb -D /owned-pg -U trial -A scram-sha-256 --pwfile=/owned-tls/password '),'Reviewed initialization required');
 assert(tail.includes('ssl=on')&&tail.includes('ssl_cert_file=/owned-tls/server.pem')&&tail.includes('ssl_key_file=/owned-tls/server.key'),'TLS must remain enforced');
 const volumes=disposable.volumes;assert(Array.isArray(volumes));
 assert.equal(volumes.filter(v=>v.target==='/owned-pg'&&v.read_only===false).length,1);
 const command=`set -eu\nmajor=$(postgres --version | sed -n 's/^postgres (PostgreSQL) \\([0-9][0-9]*\\)\\..*/\\1/p')\n[ -n "$major" ] || exit 70\nif [ -f /owned-pg/PG_VERSION ]; then\n  [ "$(cat /owned-pg/PG_VERSION)" = "$major" ] || exit 71\n  [ -s /owned-pg/pg_hba.conf ] || exit 72\nelse\n  [ -z "$(find /owned-pg -mindepth 1 -maxdepth 1 -print -quit)" ] || exit 73\n  ${init}\nfi\nexec postgres -D /owned-pg ${tail}`;
 return {...structuredClone(disposable),restart:'unless-stopped',command:[command.replaceAll('$',()=> '$$')]};
}
