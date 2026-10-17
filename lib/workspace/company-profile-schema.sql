-- Migration 29: optional business directory. It never changes action authority.
ALTER TABLE ll_orgs ADD COLUMN company_profile jsonb;
ALTER TABLE ll_orgs ADD CONSTRAINT ll_company_profile_object CHECK(company_profile IS NULL OR (jsonb_typeof(company_profile)='object' AND octet_length(company_profile::text)<=262144));
