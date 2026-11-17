-- Migration 32: bounded CRM/email human authority; no metadata-derived grants.
ALTER TABLE ll_orgs ADD COLUMN connector_member_access jsonb;
ALTER TABLE ll_orgs ADD CONSTRAINT ll_connector_member_access_shape CHECK (
 connector_member_access IS NULL OR (jsonb_typeof(connector_member_access)='object'
 AND octet_length(connector_member_access::text)<=131072
 AND connector_member_access->>'contract'='connector-member-access-1'
 AND jsonb_typeof(connector_member_access->'version')='number'));
CREATE FUNCTION ll_connector_member_access32() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.connector_member_access IS NOT NULL THEN RAISE EXCEPTION 'Install member authority after company creation' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.connector_member_access IS NOT DISTINCT FROM OLD.connector_member_access THEN RETURN NEW; END IF;
 IF current_user<>pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='ll_orgs'::regclass)) THEN
  RAISE EXCEPTION 'Offline company owner required for member authority' USING ERRCODE='42501';
 END IF;
 IF NEW.connector_member_access IS NULL OR
  (NEW.connector_member_access->>'version')::bigint<>COALESCE((OLD.connector_member_access->>'version')::bigint,0)+1 THEN
  RAISE EXCEPTION 'Member authority cannot reset or downgrade' USING ERRCODE='23514';
 END IF;
 -- Reuse released membership snapshots. Any policy change fences retained work;
 -- adding permissions later never revives old plans, decisions or agent owners.
 UPDATE ll_quote_member_generations SET generation=generation+1 WHERE org_id=NEW.id;
 RETURN NEW;
END $$;
CREATE TRIGGER ll_connector_member_access32 BEFORE INSERT OR UPDATE OF connector_member_access ON ll_orgs
 FOR EACH ROW EXECUTE FUNCTION ll_connector_member_access32();
