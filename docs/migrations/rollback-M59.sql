-- SPEC-001 rollback M59: remove only the SPEC-001-created facility workspace seed.
-- Snapshot the database before running this file.
-- This delete is guarded so an in-use or operator-modified facility workspace is left in place.

DELETE FROM workspaces
WHERE slug = 'facility'
  AND name = 'Facility'
  AND NOT EXISTS (
    SELECT 1
    FROM tasks
    WHERE tasks.workspace_id = workspaces.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM agents
    WHERE agents.workspace_id = workspaces.id
  );

DELETE FROM schema_migrations
WHERE id = '059_facility_workspace_seed'
  AND NOT EXISTS (
    SELECT 1
    FROM workspaces
    WHERE slug = 'facility'
      AND name = 'Facility'
  );
