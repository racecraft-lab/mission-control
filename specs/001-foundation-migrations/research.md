# Research: SPEC-001 Foundation Migrations

## Decision 1: Keep the migration runner authoritative and keep `schema.sql` read-only

- **Decision**: Append `M53-M61` only in [`src/lib/migrations.ts`](/Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/001-foundation-migrations/src/lib/migrations.ts) and treat [`src/lib/schema.sql`](/Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/001-foundation-migrations/src/lib/schema.sql) as a reference artifact during SPEC-001.
- **Rationale**: The workflow prompt states migrations remain authoritative. Keeping schema changes in the existing forward-only migration chain preserves repo truth and avoids fresh-install drift unless later implementation work explicitly tests and documents it.
- **Alternatives considered**:
  - Update `schema.sql` in parallel now: rejected because the prompt keeps it read-only unless fresh-install ordering is explicitly tested and documented.
  - Introduce a separate migration runner: rejected because it widens scope beyond the existing migration surface.

## Decision 2: Use explicit SQLite guards for rerun-safe additive changes

- **Decision**: Guard `ADD COLUMN` operations with `PRAGMA table_info(...)`, create tables with `CREATE TABLE IF NOT EXISTS`, and create indexes with deterministic names plus `CREATE [UNIQUE] INDEX IF NOT EXISTS`.
- **Rationale**: SPEC-001 prioritizes safe reruns on partially migrated or production-shape databases. SQLite does not reliably provide `ADD COLUMN IF NOT EXISTS` across the existing stack, so explicit guards are the safe path.
- **Alternatives considered**:
  - Unconditional `ALTER TABLE ... ADD COLUMN`: rejected because duplicate-column reruns would fail.
  - Rebuild existing tables to normalize schema state: rejected because destructive or rewrite-heavy approaches violate additive safety.

## Decision 3: Preserve live schema names exactly as already verified

- **Decision**: Keep `agents.workspace_path`, `workflow_templates`, `workspaces.name`, and the existing `tasks.status` contract unchanged while adding new persistence surfaces around them.
- **Rationale**: The constitution and workflow both treat these names as schema-truth anchors. Preserving them avoids upstream divergence, merge pressure, and false assertions in docs or tasks.
- **Alternatives considered**:
  - Rename `agents.workspace_path` to `sandbox_path`: rejected because the spec explicitly forbids it.
  - Introduce `task_templates`: rejected because `workflow_templates` is already the live table.
  - Add a database `CHECK` to expand `tasks.status`: rejected because status vocabulary work belongs to a later spec.

## Decision 4: Model workflow-template routing metadata as additive table extensions

- **Decision**: Extend `workflow_templates` in `M54` with a minimal set of additive metadata columns for slug-based lookup, routing rules, successor behavior, output expectations, PR production, terminal events, and artifact-redaction policy.
- **Rationale**: The spec requires downstream queryable persistence surfaces now, but runtime behavior lands later. Additive columns on the existing table satisfy storage needs without inventing new runtime modules or new top-level tables beyond what the spec requires.
- **Alternatives considered**:
  - Create a new template companion table now: rejected because it introduces extra joins and speculative structure before a concrete consumer exists.
  - Store nothing until runtime work begins: rejected because later specs need the schema surfaces in place first.

## Decision 5: Keep task lineage minimal but queryable

- **Decision**: Add only the lineage fields needed to identify a task's workflow-template origin and its predecessor/root chain relationships in `M55`.
- **Rationale**: This gives later specs enough structure for chained execution and traceability while honoring the constitution's anti-speculation rule.
- **Alternatives considered**:
  - Add a large normalized workflow-run subsystem now: rejected because it exceeds the migration-only scope.
  - Add only one source column: rejected because the spec explicitly calls for predecessor/successor lineage support.

## Decision 6: Seed `facility` from live tenants and keep reruns side-effect free

- **Decision**: In `M59`, resolve the default tenant using `ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, id ASC`, create the `facility` workspace only when it does not already exist, and leave existing rows untouched on rerun.
- **Rationale**: This satisfies the clarified tenant-resolution rule and avoids brittle assumptions such as `tenant_id = 1`.
- **Alternatives considered**:
  - Hardcode `tenant_id = 1`: rejected because the spec forbids it.
  - Update an existing `facility` row on rerun: rejected because the clarified behavior is to leave an existing row unchanged.

## Decision 7: Deliver rollback as manual reverse SQL plus an operator runbook

- **Decision**: Ship one idempotent rollback SQL file per SQL-changing migration or seed (`rollback-M53.sql` through `rollback-M61.sql`) and document snapshot-first reverse-order execution in `docs/migrations/rollback-procedure.md`.
- **Rationale**: The runtime migration path is forward-only by constitution. Checked-in reverse SQL and a runbook give operators a recoverable path without widening product scope into automated rollback support.
- **Alternatives considered**:
  - Add `down()` handlers or a rollback CLI: rejected because the prompt explicitly forbids automated rollback.
  - Skip rollback for seed-only changes: rejected because the spec requires one rollback file for each SQL-changing migration or seed.

## Decision 8: No `contracts/` artifact for this phase

- **Decision**: Do not generate `specs/001-foundation-migrations/contracts/`.
- **Rationale**: SPEC-001 does not define a new external API, CLI, protocol, or UI contract. It adds internal persistence surfaces only.
- **Alternatives considered**:
  - Generate placeholder contracts documentation: rejected because it adds noise without defining a real interface boundary.
