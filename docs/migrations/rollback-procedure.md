# SPEC-001 Manual Rollback Procedure

SPEC-001 adds forward-only migrations M53 through M61. The live migration runner has no `down()` hook, so rollback is an operator-initiated manual SQL procedure.

## Preconditions

1. Stop Mission Control writers.
2. Snapshot the SQLite database file before making changes.
3. Confirm the database is on the SPEC-001 tail:

```sql
SELECT id, applied_at
FROM schema_migrations
WHERE id BETWEEN '053_agent_scope' AND '061_resource_policy_events'
ORDER BY id;
```

4. Confirm the database snapshot exists and is restorable before running any rollback file. The M53-M56 column rollbacks use SQLite copy-and-rename table rebuilds so they remain replay-safe after the SPEC-001 columns are already absent.

## Reverse Order

Apply the rollback files in this exact order:

1. `docs/migrations/rollback-M61.sql`
2. `docs/migrations/rollback-M60.sql`
3. `docs/migrations/rollback-M59.sql`
4. `docs/migrations/rollback-M58.sql`
5. `docs/migrations/rollback-M57.sql`
6. `docs/migrations/rollback-M56.sql`
7. `docs/migrations/rollback-M55.sql`
8. `docs/migrations/rollback-M54.sql`
9. `docs/migrations/rollback-M53.sql`

## SQLite Column Rollback Guidance

SQLite supports `ALTER TABLE ... DROP COLUMN`, but it does not support `DROP COLUMN IF EXISTS`. The M53-M56 rollback files therefore use transactional copy-and-rename table rebuilds instead of direct `DROP COLUMN` statements. Re-running those files after rollback leaves the baseline schema intact.

## Facility Workspace Guard

`rollback-M59.sql` deletes only a workspace with `slug='facility'` and `name='Facility'` when no tasks or agents reference it. If later specs or operators have attached data to that workspace, the row and migration marker remain for operator review.

## Post-Rollback Checks

```sql
SELECT id
FROM schema_migrations
WHERE id BETWEEN '053_agent_scope' AND '061_resource_policy_events'
ORDER BY id;

PRAGMA table_info(agents);
PRAGMA table_info(workflow_templates);
PRAGMA table_info(tasks);
PRAGMA table_info(workspaces);
SELECT name FROM sqlite_master WHERE type='table' AND name IN (
  'task_dispositions',
  'task_artifacts',
  'resource_policies',
  'resource_policy_events'
);
```

The first query should return no rows. The table-info checks should no longer list the SPEC-001 columns, and the final table query should return no rows.
