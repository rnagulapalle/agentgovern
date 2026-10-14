
import subprocess,json,hashlib,pathlib,datetime
DB='ll-platform-27ec7699f577-application-db-1'
def sql(text):
 return subprocess.check_output(['docker','exec',DB,'psql','-X','-h','/tmp','-U','trial','-d','trial','-At','-v','ON_ERROR_STOP=1','-c',text],text=True).strip()
def ident(s):return '"'+s.replace('"','""')+'"'
relations=json.loads(sql("SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'oid',c.oid::text,'owner',c.relowner::text,'acl',c.relacl::text) ORDER BY n.nspname,c.relname),'[]') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'"))
parts=[]
for r in relations:
 key=(r['schema']+'.'+r['name']).replace("'","''")
 parts.append("SELECT '"+key+"' name, jsonb_build_object('count',count(*),'sha256',encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex')) data FROM "+ident(r['schema'])+'.'+ident(r['name'])+' t')
checks=json.loads(sql("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT jsonb_object_agg(name,data) FROM ("+' UNION ALL '.join(parts)+") snapshots; COMMIT;").splitlines()[1])
roles=json.loads(sql("SELECT jsonb_agg(jsonb_build_object('oid',oid::text,'name',rolname,'superuser',rolsuper,'inherit',rolinherit,'createRole',rolcreaterole,'createDatabase',rolcreatedb,'login',rolcanlogin,'replication',rolreplication,'bypassRls',rolbypassrls,'validUntil',rolvaliduntil,'passwordDigest',encode(sha256(convert_to(coalesce(rolpassword,''),'UTF8')),'hex')) ORDER BY oid) FROM pg_authid"))
roleMembers=sql("SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') FROM pg_auth_members t")
schemas=json.loads(sql("SELECT jsonb_agg(jsonb_build_object('oid',oid::text,'name',nspname,'owner',nspowner::text,'acl',nspacl::text) ORDER BY oid) FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname<>'information_schema'"))
database=json.loads(sql("SELECT jsonb_build_object('systemIdentifier',(SELECT system_identifier::text FROM pg_control_system()),'databaseOid',oid::text,'database',datname,'ownerOid',datdba::text) FROM pg_database WHERE datname=current_database()"))
sequences=json.loads(sql("SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') FROM pg_sequences t WHERE schemaname NOT LIKE 'pg_%'"))
functions=json.loads(sql("SELECT coalesce(jsonb_agg(jsonb_build_object('oid',p.oid::text,'schema',n.nspname,'name',p.proname,'owner',p.proowner::text,'acl',p.proacl::text,'securityDefiner',p.prosecdef,'configuration',p.proconfig,'definitionSha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')) ORDER BY p.oid),'[]') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND p.prokind IN ('f','p')"))
views=json.loads(sql("SELECT coalesce(jsonb_agg(jsonb_build_object('oid',c.oid::text,'schema',n.nspname,'name',c.relname,'kind',c.relkind,'owner',c.relowner::text,'acl',c.relacl::text,'definitionSha256',encode(sha256(convert_to(pg_get_viewdef(c.oid,true),'UTF8')),'hex')) ORDER BY c.oid),'[]') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('v','m') AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'"))
defaultAcl=sql("SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') FROM pg_default_acl t")
roleConfig=sql("SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') FROM pg_db_role_setting t")
stateRoot=pathlib.Path('/srv/looplabs-production/releases/d4ee705d806f74d2433e298f08cc761ad1fba45a/installation/private-runtime/application/quote-provider/email-state')
emailFiles={str(f.relative_to(stateRoot)):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(stateRoot.rglob('*')) if f.is_file()}
node="import pathlib,hashlib,json;root=pathlib.Path('/state');files=sorted(root.rglob('*'));assert not any(f.is_symlink() for f in files);print(json.dumps({str(f.relative_to(root)):hashlib.sha256(f.read_bytes()).hexdigest() for f in files if f.is_file()}))"
connectorFiles=json.loads(subprocess.check_output(['docker','exec','ll-platform-27ec7699f577-connector-twin-1','python3','-c',node],text=True))
print(json.dumps({'checkedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Read-only local maintenance SQL and persisted provider file digests; not application TLS acceptance. No raw table rows or credentials emitted.','database':database,'schemas':schemas,'roles':roles,'roleMembershipSha256':hashlib.sha256(roleMembers.encode()).hexdigest(),'relationMetadata':relations,'relations':checks,'sequences':sequences,'functions':functions,'views':views,'defaultAclSha256':hashlib.sha256(defaultAcl.encode()).hexdigest(),'roleConfigSha256':hashlib.sha256(roleConfig.encode()).hexdigest(),'emailStateFiles':emailFiles,'connectorStateFiles':connectorFiles}))
