-- SPEC-001 rollback M60: drop resource_policies.
-- Snapshot the database before running this file.
-- Run rollback-M61.sql first so resource_policy_events no longer references this table.

PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS idx_resource_policies_scope;
DROP INDEX IF EXISTS idx_resource_policies_template;
DROP INDEX IF EXISTS idx_resource_policies_enabled;
DROP TABLE IF EXISTS resource_policies;

DELETE FROM schema_migrations
WHERE id = '060_resource_policies';

PRAGMA foreign_keys = ON;
