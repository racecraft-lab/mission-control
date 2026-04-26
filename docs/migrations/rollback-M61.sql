-- SPEC-001 rollback M61: drop resource_policy_events.
-- Snapshot the database before running this file.

PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS idx_resource_policy_events_created_at;
DROP INDEX IF EXISTS idx_resource_policy_events_task;
DROP INDEX IF EXISTS idx_resource_policy_events_policy;
DROP TABLE IF EXISTS resource_policy_events;

DELETE FROM schema_migrations
WHERE id = '061_resource_policy_events';

PRAGMA foreign_keys = ON;
