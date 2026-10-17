-- Migration 31: retain explicit source owner/department/purpose. No authority grants.
ALTER TABLE ll_cloud_runtime_observations DROP CONSTRAINT ll_cloud_runtime_metadata_object;
ALTER TABLE ll_cloud_runtime_observations ADD CONSTRAINT ll_cloud_runtime_metadata_object CHECK (
 declared_metadata IS NULL OR (
  jsonb_typeof(declared_metadata)='object' AND octet_length(declared_metadata::text)<=4096
  AND declared_metadata->>'source'='aws-runtime-declaration'
  AND declared_metadata ?& ARRAY['schemaVersion','source','metadataVersion','organization','ownerOrganization','ownerTeam','environment','onCallStatus']
  AND ((declared_metadata->>'schemaVersion'='1'
    AND declared_metadata - ARRAY['schemaVersion','source','metadataVersion','organization','ownerOrganization','ownerTeam','environment','onCallStatus']='{}'::jsonb)
   OR (declared_metadata->>'schemaVersion'='2'
    AND declared_metadata ?& ARRAY['owner','department','purpose']
    AND declared_metadata - ARRAY['schemaVersion','source','metadataVersion','organization','ownerOrganization','ownerTeam','environment','onCallStatus','owner','department','purpose']='{}'::jsonb))
 ) IS TRUE
);
