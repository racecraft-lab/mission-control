-- SPEC-001 rollback M58: drop task_artifacts.
-- Snapshot the database before running this file.

PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS idx_task_artifacts_task_created_at;
DROP INDEX IF EXISTS idx_task_artifacts_workspace_type;
DROP INDEX IF EXISTS idx_task_artifacts_workflow_template_slug;
DROP TABLE IF EXISTS task_artifacts;

DELETE FROM schema_migrations
WHERE id = '058_task_artifacts';

PRAGMA foreign_keys = ON;
