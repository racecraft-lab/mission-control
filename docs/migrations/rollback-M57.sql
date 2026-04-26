-- SPEC-001 rollback M57: drop task_dispositions.
-- Snapshot the database before running this file.

PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS idx_task_dispositions_task_id;
DROP INDEX IF EXISTS idx_task_dispositions_workspace_triaged_at;
DROP INDEX IF EXISTS idx_task_dispositions_disposition;
DROP TABLE IF EXISTS task_dispositions;

DELETE FROM schema_migrations
WHERE id = '057_task_dispositions';

PRAGMA foreign_keys = ON;
