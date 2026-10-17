-- Migration 30: source-reported business labels. No identity or execution grants.
ALTER TABLE ll_cloud_runtime_observations ADD COLUMN declared_metadata jsonb;
ALTER TABLE ll_cloud_runtime_observations ADD CONSTRAINT ll_cloud_runtime_metadata_object CHECK (
 declared_metadata IS NULL OR (
  jsonb_typeof(declared_metadata)='object' AND octet_length(declared_metadata::text)<=4096
  AND declared_metadata ?& ARRAY['schemaVersion','source','metadataVersion','organization','ownerOrganization','ownerTeam','environment','onCallStatus']
  AND declared_metadata - ARRAY['schemaVersion','source','metadataVersion','organization','ownerOrganization','ownerTeam','environment','onCallStatus']='{}'::jsonb
  AND declared_metadata->>'schemaVersion'='1' AND declared_metadata->>'source'='aws-runtime-declaration'
 )
);
