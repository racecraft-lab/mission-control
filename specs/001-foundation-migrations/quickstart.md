# Quickstart: SPEC-001 Foundation Migrations

## Goal

Validate the planned `M53-M61` migration tail on a copied SQLite database, confirm rerun safety, and verify the manual rollback flow without introducing runtime/UI/type/config work.

## Prerequisites

- Node.js `>=22`
- `pnpm`
- `sqlite3` CLI available for direct schema inspection and manual rollback rehearsal
- A Mission Control database copy representing the live lineage through migration `052`

## 1. Prepare an isolated database copy

```bash
mkdir -p /tmp/spec001-data
cp /path/to/migration-052/mission-control.db /tmp/spec001-data/mission-control.db
```

Mission Control reads from `MISSION_CONTROL_DATA_DIR`, so this keeps the smoke run isolated from any primary local database.

## 2. Apply the forward migration chain

Use the normal app startup path against the copied data directory so the existing migration runner applies `M53-M61`.

```bash
MISSION_CONTROL_DATA_DIR=/tmp/spec001-data pnpm dev
```

Once startup completes and the migrations have run, stop the process.

## 3. Inspect the migrated schema and seeds

Use `sqlite3` to verify the new persistence surfaces exist and the live names stayed intact.

```bash
sqlite3 /tmp/spec001-data/mission-control.db ".schema workflow_templates"
sqlite3 /tmp/spec001-data/mission-control.db ".schema task_dispositions"
sqlite3 /tmp/spec001-data/mission-control.db ".schema task_artifacts"
sqlite3 /tmp/spec001-data/mission-control.db ".schema resource_policies"
sqlite3 /tmp/spec001-data/mission-control.db ".schema resource_policy_events"
sqlite3 /tmp/spec001-data/mission-control.db "SELECT name, scope FROM agents WHERE lower(name) IN ('aegis','security guardian','hal') ORDER BY lower(name);"
sqlite3 /tmp/spec001-data/mission-control.db "SELECT slug, name, tenant_id FROM workspaces WHERE slug = 'facility';"
```

## 4. Re-run the migration chain and confirm idempotency

Start Mission Control again against the same copied database.

```bash
MISSION_CONTROL_DATA_DIR=/tmp/spec001-data pnpm dev
```

After the second run completes, verify there is still exactly one `facility` workspace row and no duplicate schema objects or seed rows.

```bash
sqlite3 /tmp/spec001-data/mission-control.db "SELECT COUNT(*) FROM workspaces WHERE slug = 'facility';"
sqlite3 /tmp/spec001-data/mission-control.db "SELECT COUNT(*) FROM agents WHERE lower(name) IN ('aegis','security guardian','hal') AND scope = 'global';"
```

## 5. Rehearse the manual rollback path

Take a fresh snapshot before rollback rehearsal.

```bash
cp /tmp/spec001-data/mission-control.db /tmp/spec001-data/mission-control.pre-rollback.db
```

Apply rollback files in reverse order from `M61` through `M53`.

```bash
sqlite3 /tmp/spec001-data/mission-control.db < docs/migrations/rollback-M61.sql
sqlite3 /tmp/spec001-data/mission-control.db < docs/migrations/rollback-M60.sql
sqlite3 /tmp/spec001-data/mission-control.db < docs/migrations/rollback-M59.sql
sqlite3 /tmp/spec001-data/mission-control.db < docs/migrations/rollback-M58.sql
sqlite3 /tmp/spec001-data/mission-control.db < docs/migrations/rollback-M57.sql
sqlite3 /tmp/spec001-data/mission-control.db < docs/migrations/rollback-M56.sql
sqlite3 /tmp/spec001-data/mission-control.db < docs/migrations/rollback-M55.sql
sqlite3 /tmp/spec001-data/mission-control.db < docs/migrations/rollback-M54.sql
sqlite3 /tmp/spec001-data/mission-control.db < docs/migrations/rollback-M53.sql
```

Then verify the SPEC-001 additions are gone or reversed exactly as the rollback files document.

## 6. Run the repository verification commands

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
```

These commands should continue to pass unchanged after the migration tail is implemented.
