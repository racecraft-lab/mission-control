# Feature Specification: SPEC-001 Foundation Migrations

**Feature Branch**: `001-foundation-migrations`  
**Created**: 2026-04-25  
**Status**: Draft  
**Input**: User description: "Create a migration-only specification for RC Factory Phase 0 in Mission Control."

## Clarifications

### Session 2026-04-25

- Q: How must M53-M61 remain rerun-safe on existing databases? -> A: Every step stays additive and idempotent: `ADD COLUMN` only when the column is absent, tables and indexes use rerun-safe creation, and backfills or seeds touch only the intended missing or null rows.
- Q: How must `ALTER TABLE ... ADD COLUMN` be implemented for this stack? -> A: Guard each column add with `PRAGMA table_info(...)`; do not rely on SQLite `ADD COLUMN IF NOT EXISTS`, and do not rerun unguarded duplicate-column DDL.
- Q: How is the `facility` workspace tenant resolved safely? -> A: Resolve the default tenant from existing live rows with active-first ordering (`status='active'` first, then lowest `id`), and leave an existing `facility` workspace row untouched on rerun.
- Q: How must new indexes be created and named? -> A: Use deterministic canonical names and `CREATE INDEX IF NOT EXISTS` or `CREATE UNIQUE INDEX IF NOT EXISTS`, including the non-null partial unique index for `workflow_templates(workspace_id, slug)`.
- Q: How must rollback for M53-M61 be delivered and executed? -> A: Ship one idempotent checked-in reverse SQL file per SQL-changing migration or seed, require operators to snapshot first and execute rollback manually in reverse order from M61 to M53, and do not add an automated rollback CLI or `down()` runner.
- Q: What `ready_for_owner` work is in scope for SPEC-001? -> A: Only the no-SQL safety proof: preserve application-level-only `tasks.status` validation and make no database `CHECK` change; application vocabulary work belongs to SPEC-005.
- Q: What Sandbox terminology work is in scope for SPEC-001? -> A: Only the schema safety proof: keep `agents.workspace_path`, do not add `sandbox_path`, and do not rename the `agents` column; UI/config/type/doc-copy rename work belongs to SPEC-002+.
- Q: Where does `resolveFlag()` runtime behavior belong? -> A: SPEC-001 stores `workspaces.feature_flags` only; SPEC-002 owns `resolveFlag(name, ctx)` and runtime feature-flag behavior.
- Q: Is any new TS/TSX production module expected in SPEC-001? -> A: No; avoid new TS/TSX production modules for this migration-only spec, so Strict Scope remains N/A unless an unavoidable module is explicitly justified.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Apply the Phase 0 Schema Tail Safely (Priority: P1)

As a facility operator, I can apply M53-M61 to an existing production-shape Mission Control database so the install gains the Phase 0 schema surfaces without changing current runtime behavior.

**Why this priority**: Downstream work cannot begin until the persistent schema surfaces exist, and existing installs must remain stable while they are added.

**Independent Test**: Apply the migration set once to a production-shape database at migration `052`, inspect the schema and seeded data, and confirm existing Mission Control behavior remains unchanged.

**Acceptance Scenarios**:

1. **Given** a production-shape database at migration `052`, **When** the operator applies M53-M61 once, **Then** the schema gains the required additive columns, tables, indexes, and seed data without renaming live columns or removing existing data.
2. **Given** the migration run completed successfully, **When** the operator inspects the schema, **Then** the system exposes the Phase 0 surfaces for global agents, workflow-template routing, task lineage, workspace feature flags, task dispositions, task artifacts, and resource governance.
3. **Given** the migration run completed successfully, **When** the operator exercises existing Mission Control verification, **Then** current runtime behavior still works without any UI, config, type, API, CLI, or scheduler changes.

---

### User Story 2 - Re-run Migrations Without Side Effects (Priority: P1)

As an operator, I can re-run the Phase 0 migration set safely so repeat execution does not duplicate schema objects, seed data, or state changes.

**Why this priority**: Forward-only migrations must be safe to retry during deployment and recovery workflows.

**Independent Test**: Run the completed migration set a second time against the same database and verify that no duplicate columns, tables, indexes, seed rows, or unintended data updates appear.

**Acceptance Scenarios**:

1. **Given** a database that already contains every M53-M61 change, **When** the operator re-runs the migration set, **Then** no additional schema or seed changes are applied.
2. **Given** the three named global agents already have the expected scope, **When** the operator re-runs the migration set, **Then** those rows remain correct and no unrelated agent records change.
3. **Given** the `facility` workspace already exists, **When** the operator re-runs the migration set, **Then** exactly one `facility` workspace remains present and linked to the resolved live tenant.

---

### User Story 3 - Roll Back Manually with Checked-In Guidance (Priority: P2)

As a maintainer or operator, I can manually reverse each SQL-changing M53-M61 step using checked-in reverse SQL and a rollback runbook.

**Why this priority**: The live migration runner is forward-only, so safe operational recovery depends on clear manual rollback coverage.

**Independent Test**: Review the rollback package, take a database snapshot, and confirm every SQL-changing migration or seed from M53 through M61 has a matching reverse SQL file that can be applied in reverse order.

**Acceptance Scenarios**:

1. **Given** an operator must reverse the Phase 0 schema tail, **When** they consult the rollback package, **Then** they can find one rollback file for each SQL-changing migration or seed from M53 through M61.
2. **Given** an operator is preparing to roll back, **When** they follow the runbook, **Then** it instructs them to take a database snapshot first and to execute rollback files in reverse order from M61 to M53.
3. **Given** a rollback was only partially applied previously, **When** the operator re-runs the relevant rollback step, **Then** the reverse SQL is safe to apply again without making the database state worse.

---

### User Story 4 - Hand Off Stable Schema Surfaces to Later Specs (Priority: P3)

As a downstream spec executor, I can depend on the Phase 0 schema surfaces being present while all new runtime behavior remains OFF or unimplemented.

**Why this priority**: Later specs need these persistent structures, but SPEC-001 must not expand into runtime or product-surface work.

**Independent Test**: Inspect the completed spec and migrated database to confirm the schema surfaces exist, while runtime feature resolution, task-chain execution, artifact publishing, resource-governance behavior, and vocabulary cleanup remain out of scope.

**Acceptance Scenarios**:

1. **Given** SPEC-001 has been applied, **When** a later spec reads the database, **Then** it finds the required Phase 0 schema surfaces ready for downstream implementation work.
2. **Given** SPEC-001 scope is reviewed, **When** a maintainer checks for non-migration work, **Then** no runtime, UI, config, type, API, CLI, GitHub-label, Kanban, or scheduler changes are included.
3. **Given** the `tasks` and `agents` schema are inspected after SPEC-001, **When** the maintainer verifies the safety constraints, **Then** there is no database `CHECK` expansion for `ready_for_owner`, no `sandbox_path`, and no rename of `agents.workspace_path`.

### Edge Cases

- A database may already contain some Phase 0 columns, indexes, or seed rows from a partial or manually interrupted rollout; the migration set must remain safe to re-run.
- Agent names for the global-scope backfill may differ only by letter case; the backfill must still target only Aegis, Security Guardian, and HAL.
- The `facility` workspace seed must not create duplicates if a `facility` row already exists.
- Rollback may begin from a partially applied or partially reversed state; manual reverse SQL must remain safe in that condition.
- Feature-flag storage may exist before any runtime resolution logic does; storing the flags must not enable behavior by itself.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST add a migration-only Phase 0 schema tail covering M53 through M61 for existing Mission Control databases after the current migration `052`.
- **FR-002**: The system MUST keep every M53-M61 change additive and idempotent so operators can apply or retry the migration set without destructive schema rewrites; `ALTER TABLE ... ADD COLUMN` steps MUST probe `PRAGMA table_info(...)` first, tables and indexes MUST use rerun-safe creation, and data backfills or seeds MUST target only missing or null rows.
- **FR-003**: The system MUST add `agents.scope` and backfill `scope='global'` for the existing agents named Aegis, Security Guardian, and HAL using case-insensitive matching.
- **FR-004**: The system MUST preserve the live `agents.workspace_path` column and MUST NOT add `sandbox_path` or rename `workspace_path`.
- **FR-005**: The system MUST use `workflow_templates` as the template table and extend it with the routing and artifact-policy metadata needed for downstream work, including stable non-null slug uniqueness enforced by a deterministic partial unique index on `(workspace_id, slug)` for rows where `slug IS NOT NULL`.
- **FR-006**: The system MUST add the workflow-template binding and lineage fields needed on `tasks` for downstream task chaining.
- **FR-007**: The system MUST preserve `tasks.status` as application-level validation only and MUST NOT add or rebuild any database `CHECK` constraint for `ready_for_owner`.
- **FR-008**: The system MUST add `workspaces.feature_flags` as persistent storage while keeping all new feature flags effectively OFF until later runtime work implements flag resolution.
- **FR-009**: The system MUST treat `workspaces.name` as the live workspace display field when seeding or validating workspace records.
- **FR-010**: The system MUST add a queryable `task_dispositions` surface with the indexes needed for downstream disposition lookups.
- **FR-011**: The system MUST add a queryable `task_artifacts` surface with indexes that support task chronology and workspace artifact lookups.
- **FR-012**: The system MUST seed exactly one `facility` workspace by resolving the default tenant from live tenant rows using `ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, id ASC`, MUST leave an existing `facility` row unchanged on rerun, and MUST NOT hardcode `tenant_id=1`.
- **FR-013**: The system MUST add queryable `resource_policies` and `resource_policy_events` surfaces with indexes that support policy-scope access and task/time audit history.
- **FR-014**: The system MUST leave existing Mission Control runtime behavior unchanged and MUST NOT include UI, config, TypeScript type, Zod, API, CLI, scheduler, GitHub-label, Kanban, or other non-migration product-surface work in SPEC-001; this includes no Sandbox UI/config/type/doc-copy rename work, no `ready_for_owner` application vocabulary work, no `resolveFlag()` or other runtime feature-flag behavior, and no expected new TS/TSX production module additions.
- **FR-015**: The system MUST provide one checked-in, idempotent rollback SQL file for each SQL-changing migration or seed from M53 through M61.
- **FR-016**: The system MUST provide a manual rollback procedure that requires a pre-rollback database snapshot, specifies reverse-order execution from M61 to M53, explains SQLite drop-column considerations, and does not require any automated rollback CLI or `Migration.down()` runner.
- **FR-017**: The system MUST allow existing verification to pass unchanged after the Phase 0 schema tail is added, demonstrating no behavior regression beyond the new persistent schema surfaces.

### Key Entities *(include if feature involves data)*

- **Agent Scope**: The persisted classification that distinguishes global agents from workspace-bound agents while preserving the existing workspace path field.
- **Workflow Template Routing Metadata**: The stored template attributes that let later specs describe task-chain successors, routing rules, output expectations, PR production, terminal events, and artifact redaction policy.
- **Task Lineage Record**: The persisted fields on a task that identify which workflow template it came from and how it relates to predecessor or successor task chains.
- **Workspace Feature Flag Set**: The stored per-workspace flags payload that exists before runtime resolution behavior is implemented.
- **Task Disposition**: A persisted record describing an explicit task handoff or resolution outcome for later RC Factory workflows.
- **Task Artifact**: A persisted record of a task-produced artifact, including enough metadata for later lookup by task timeline and workspace artifact type.
- **Facility Workspace**: The seeded workspace row representing the facility context, keyed by slug and tied to a default tenant resolved from live data.
- **Resource Policy**: The persisted governance rule describing what resource access constraints later specs may enforce.
- **Resource Policy Event**: The persisted audit record that tracks policy decisions or changes over time for later compliance and operational review.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A production-shape database at migration `052` can accept M53-M61 in one forward pass without data loss, without renaming live schema fields, and without requiring any runtime or product-surface changes.
- **SC-002**: An immediate second execution of the completed migration set produces no duplicate-column errors and no duplicate columns, tables, indexes, or seeded rows.
- **SC-003**: Post-migration validation shows exactly three backfilled global agents for Aegis, Security Guardian, and HAL, and exactly one `facility` workspace row.
- **SC-004**: Post-migration validation shows the required workflow-template routing metadata, task lineage fields, workspace feature-flag storage, task dispositions, task artifacts, resource policies, and resource policy events are all queryable.
- **SC-005**: The rollback package includes reverse SQL coverage for every SQL-changing M53-M61 step and a runbook that instructs operators to snapshot first and roll back in reverse order.
- **SC-006**: Existing automated verification passes unchanged after the migration set is introduced, confirming SPEC-001 added persistence only and no new runtime behavior.

## Assumptions

- Existing production-shape databases targeted by SPEC-001 are already on the live schema lineage through migration `052`.
- Production-shape databases at migration `052` already contain tenant rows that let M59 resolve the default tenant from live data without inventing or hardcoding a tenant identifier.
- `workflow_templates` is the canonical template table and `workspaces.name` is the live workspace name field throughout this spec.
- Feature-flag persistence can exist safely before any runtime flag-resolution behavior, so storing `feature_flags` alone does not change product behavior.
- Operators performing rollback have permission and operational time to take a database snapshot before applying manual reverse SQL.
