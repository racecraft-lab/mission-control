# Tasks: SPEC-001 Foundation Migrations

**Input**: Design documents from `/specs/001-foundation-migrations/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `quickstart.md`, `checklists/`

**Tests**: Migration smoke, rerun/idempotency, rollback rehearsal, and no-runtime-drift checks are required for this spec.

**Organization**: Tasks are grouped by user story so each story remains independently testable within the migration-only scope.

## Format: `[ID] [P?] [Story] Description`

- `[P]` marks a task that is safe to execute in parallel because it targets a different file and does not depend on incomplete work.
- `[Story]` maps the task to the user story from `spec.md`.
- Every task below includes at least one concrete file path.

## Phase 1: Setup (Schema Truth and Test Scaffolding)

**Purpose**: Establish the copied-database migration smoke harness and capture the live schema anchors before implementation starts.

- [ ] T001 Create the copied-database migration smoke scaffold in `src/lib/__tests__/migrations-phase0.test.ts` for first-run coverage of `src/lib/migrations.ts` (P0-AC1).
- [ ] T002 Add schema inspection assertions in `src/lib/__tests__/migrations-phase0.test.ts` for `src/lib/migrations.ts` and `src/lib/schema.sql` so the tests pin the live `agents.workspace_path`, `workflow_templates`, `tasks.status`, and `workspaces.name` anchors before implementation (P0-AC5, P0-AC6, P0-AC7, P0-AC13, P0-AC14).

---

## Phase 2: Foundational (Blocking Verification Helpers)

**Purpose**: Build the reusable migration/rerun helpers and negative-check scaffolding that all user stories depend on.

**CRITICAL**: No user story work should begin until this phase is complete.

- [ ] T003 Add reusable SQLite migration, rerun, and schema-query helpers in `src/lib/__tests__/migrations-phase0.test.ts` using the copied-database flow documented in `specs/001-foundation-migrations/quickstart.md` (P0-AC1, P0-AC2).
- [ ] T004 Add negative-check helper coverage in `src/lib/__tests__/migrations-phase0.test.ts` for forbidden `CHECK (status`, `ready_for_owner`, `sandbox_path`, and `ALTER TABLE agents RENAME COLUMN` drift from `src/lib/migrations.ts` and `src/lib/schema.sql` (P0-AC13, P0-AC14).

**Checkpoint**: The migration smoke harness is ready and should fail before any M53-M61 implementation lands.

---

## Phase 3: User Story 1 - Apply the Phase 0 Schema Tail Safely (Priority: P1)

**Goal**: Add M53-M61 so a production-shape database gains the required schema surfaces without runtime behavior changes.

**Independent Test**: Run the copied-database forward migration once, then inspect schema and seed state to confirm the new persistence surfaces exist and existing behavior remains unchanged.

### Tests for User Story 1

- [ ] T005 [US1] Add failing forward-run assertions in `src/lib/__tests__/migrations-phase0.test.ts` for M53-M56 columns, workflow-template slug uniqueness, and feature-flag storage (P0-AC3, P0-AC5, P0-AC6, P0-AC7).
- [ ] T006 [US1] Add failing forward-run assertions in `src/lib/__tests__/migrations-phase0.test.ts` for M57-M61 tables, indexes, global-agent backfill, and the `facility` workspace seed (P0-AC3, P0-AC4, P0-AC8, P0-AC9).

### Implementation for User Story 1

- [ ] T007 [US1] Implement M53 in `src/lib/migrations.ts` to add `agents.scope` and backfill `global` for Aegis, Security Guardian, and HAL while preserving `agents.workspace_path` (P0-AC1, P0-AC3, P0-AC14).
- [ ] T008 [US1] Implement M54 in `src/lib/migrations.ts` to extend `workflow_templates` with slug, routing, output, successor, PR, terminal-event, and artifact-redaction columns plus the partial unique slug index (P0-AC1, P0-AC5).
- [ ] T009 [US1] Implement M55 in `src/lib/migrations.ts` to add workflow-template binding and lineage fields plus supporting indexes on `tasks` without changing `tasks.status` semantics (P0-AC1, P0-AC6, P0-AC13).
- [ ] T010 [US1] Implement M56 in `src/lib/migrations.ts` to add `workspaces.feature_flags` as storage-only JSON persistence with no runtime resolution behavior (P0-AC1, P0-AC7).
- [ ] T011 [US1] Implement M57 in `src/lib/migrations.ts` to create `task_dispositions` and its downstream lookup indexes (P0-AC1, P0-AC8).
- [ ] T012 [US1] Implement M58 in `src/lib/migrations.ts` to create `task_artifacts` and its task/workspace chronology indexes (P0-AC1, P0-AC8).
- [ ] T013 [US1] Implement M59 in `src/lib/migrations.ts` to seed exactly one `facility` workspace using the live default-tenant resolution rule and `workspaces.name` (P0-AC1, P0-AC4, P0-AC14).
- [ ] T014 [US1] Implement M60 in `src/lib/migrations.ts` to create `resource_policies` and its policy-scope indexes (P0-AC1, P0-AC9).
- [ ] T015 [US1] Implement M61 in `src/lib/migrations.ts` to create `resource_policy_events` and its policy/task/time audit indexes (P0-AC1, P0-AC9).

**Checkpoint**: A first forward migration should succeed on the copied database and expose every new Phase 0 persistence surface.

---

## Phase 4: User Story 2 - Re-run Migrations Without Side Effects (Priority: P1)

**Goal**: Prove the completed M53-M61 tail is safe to rerun with no duplicate schema objects, seed rows, or unintended updates.

**Independent Test**: Run the completed migration chain twice on the same copied database and confirm the second pass applies no extra changes.

### Tests for User Story 2

- [ ] T016 [US2] Add failing rerun/idempotency assertions in `src/lib/__tests__/migrations-phase0.test.ts` for duplicate-column avoidance, duplicate-index avoidance, singleton backfill counts, and the single `facility` workspace seed (P0-AC2, P0-AC3, P0-AC4, P0-AC5, P0-AC8, P0-AC9).

### Implementation for User Story 2

- [ ] T017 [US2] Run the copied-database forward-run and rerun smoke workflow from `specs/001-foundation-migrations/quickstart.md` against `src/lib/migrations.ts`, then verify the sqlite3 queries for global agents, `facility`, workflow-template metadata, task lineage, feature flags, task artifacts, and resource-policy surfaces (P0-AC1, P0-AC2, P0-AC3, P0-AC4, P0-AC5, P0-AC6, P0-AC7, P0-AC8, P0-AC9).
- [ ] T018 [US2] Run unchanged automated verification with `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` against `src/lib/migrations.ts` and `src/lib/__tests__/migrations-phase0.test.ts` to confirm the migration-only tail does not introduce behavior regressions (P0-AC10).

**Checkpoint**: The migration tail is rerun-safe and the existing pnpm verification still passes unchanged.

---

## Phase 5: User Story 3 - Roll Back Manually with Checked-In Guidance (Priority: P2)

**Goal**: Ship one rollback artifact per SQL-changing step and a runbook that lets operators reverse the migration tail safely.

**Independent Test**: Review the rollback package, snapshot the copied database, and rehearse reverse-order execution from M61 to M53.

### Implementation for User Story 3

- [ ] T019 [US3] Draft `docs/migrations/rollback-procedure.md` with snapshot-first preparation, reverse-order execution from M61 to M53, SQLite drop-column guidance, dependent-index teardown notes, and the guarded M59 seed-removal rule (P0-AC12).
- [ ] T020 [P] [US3] Create `docs/migrations/rollback-M53.sql` with idempotent reverse SQL and preconditions for removing `agents.scope` safely (P0-AC11).
- [ ] T021 [P] [US3] Create `docs/migrations/rollback-M54.sql` with idempotent reverse SQL and preconditions for removing the M54 `workflow_templates` columns and partial unique index safely (P0-AC11).
- [ ] T022 [P] [US3] Create `docs/migrations/rollback-M55.sql` with idempotent reverse SQL and preconditions for removing the M55 `tasks` lineage fields and indexes safely (P0-AC11).
- [ ] T023 [P] [US3] Create `docs/migrations/rollback-M56.sql` with idempotent reverse SQL and preconditions for removing `workspaces.feature_flags` safely (P0-AC11).
- [ ] T024 [P] [US3] Create `docs/migrations/rollback-M57.sql` with idempotent reverse SQL and preconditions for dropping `task_dispositions` and its indexes safely (P0-AC11).
- [ ] T025 [P] [US3] Create `docs/migrations/rollback-M58.sql` with idempotent reverse SQL and preconditions for dropping `task_artifacts` and its indexes safely (P0-AC11).
- [ ] T026 [P] [US3] Create `docs/migrations/rollback-M59.sql` with idempotent reverse SQL and preconditions for removing only the SPEC-001-created `facility` workspace row when it can be identified confidently (P0-AC11).
- [ ] T027 [P] [US3] Create `docs/migrations/rollback-M60.sql` with idempotent reverse SQL and preconditions for dropping `resource_policies` and its indexes safely (P0-AC11).
- [ ] T028 [P] [US3] Create `docs/migrations/rollback-M61.sql` with idempotent reverse SQL and preconditions for dropping `resource_policy_events` and its indexes safely (P0-AC11).
- [ ] T029 [US3] Rehearse reverse-order rollback with `docs/migrations/rollback-M61.sql` through `docs/migrations/rollback-M53.sql` on the copied database from `specs/001-foundation-migrations/quickstart.md`, then update `docs/migrations/rollback-procedure.md` for any verified operator gaps (P0-AC11, P0-AC12).

**Checkpoint**: Every SQL-changing M53-M61 step has a checked-in rollback file and the runbook is validated against a rehearsal flow.

---

## Phase 6: User Story 4 - Hand Off Stable Schema Surfaces to Later Specs (Priority: P3)

**Goal**: Verify the new schema surfaces are ready for downstream specs while all runtime, vocabulary, and Sandbox cleanup work stays out of scope.

**Independent Test**: Run targeted negative checks after implementation to prove SPEC-001 stopped at persistence, rollback artifacts, and migration verification only.

### Tests for User Story 4

- [ ] T030 [US4] Add final no-runtime-drift assertions in `src/lib/__tests__/migrations-phase0.test.ts` for forbidden `ready_for_owner`, `sandbox_path`, and `ALTER TABLE agents RENAME COLUMN` patterns after M53-M61 land (P0-AC13, P0-AC14).

### Implementation for User Story 4

- [ ] T031 [US4] Run grep-based negative checks against `src/lib/migrations.ts` and `src/lib/schema.sql` to prove SPEC-001 introduced no database `CHECK (status` change and no DB-level `ready_for_owner` work (P0-AC13).
- [ ] T032 [US4] Run grep-based negative checks against `src/lib/migrations.ts`, `src/lib/schema.sql`, and `src/` to prove SPEC-001 introduced no `sandbox_path`, no `ALTER TABLE agents RENAME COLUMN`, and no runtime Sandbox rename drift (P0-AC14).
- [ ] T033 [P] [US4] Update SPEC-001 completion/status in `docs/ai/rc-factory-technical-roadmap.md` only after T017, T018, T029, T031, and T032 all pass.
- [ ] T034 [P] [US4] Update SPEC-001 completion/status in `docs/rc-factory-v1-prd.md` only after T017, T018, T029, T031, and T032 all pass.

**Checkpoint**: Downstream specs can rely on the new schema surfaces, and SPEC-001 still proves no runtime/UI/type/config drift entered the branch.

---

## Phase 7: Polish and Final Acceptance

**Purpose**: Close the migration-only loop with a final traceability pass and artifact cleanup.

- [ ] T035 Run a final acceptance sweep across `src/lib/migrations.ts`, `src/lib/__tests__/migrations-phase0.test.ts`, `docs/migrations/rollback-procedure.md`, `docs/ai/rc-factory-technical-roadmap.md`, and `docs/rc-factory-v1-prd.md` to confirm P0-AC1 through P0-AC14 evidence is captured and `specs/001-foundation-migrations/` has no unresolved markers.

---

## Dependencies and Execution Order

### Phase Dependencies

- Setup (Phase 1) has no dependencies and starts immediately.
- Foundational (Phase 2) depends on Setup and blocks all user story work.
- User Story 1 (Phase 3) depends on Foundational and establishes the migration tail.
- User Story 2 (Phase 4) depends on User Story 1 because rerun safety can only be validated after M53-M61 exist.
- User Story 3 (Phase 5) depends on User Story 1 because rollback files must match the implemented migration shapes; the rollback SQL tasks can run in parallel with each other once the migration definitions stabilize.
- User Story 4 (Phase 6) depends on User Stories 1 through 3 because the negative checks and status updates only make sense after forward, rerun, and rollback verification exist.
- Polish (Phase 7) depends on all prior phases.

### User Story Dependencies

- US1 is the MVP and delivers the Phase 0 schema tail.
- US2 depends on US1 and proves rerun/idempotency safety.
- US3 depends on US1 and proves manual rollback coverage.
- US4 depends on US1, US2, and US3 to confirm downstream readiness with no runtime drift.

### Within Each User Story

- Write or extend the failing migration checks before changing `src/lib/migrations.ts` or authoring rollback SQL.
- Complete M53-M61 forward migrations before running rerun and rollback rehearsals.
- Complete rollback SQL before the rollback rehearsal task.
- Complete forward, rerun, rollback, and grep-negative checks before updating roadmap or PRD status.

## Parallel Opportunities

- T020 through T028 can run in parallel because each rollback artifact targets a different file under `docs/migrations/`.
- T033 and T034 can run in parallel after the verification gates complete because they touch different status documents.

## Parallel Example: User Story 3

```bash
Task: "Create docs/migrations/rollback-M53.sql with idempotent reverse SQL and preconditions for removing agents.scope safely"
Task: "Create docs/migrations/rollback-M54.sql with idempotent reverse SQL and preconditions for removing the M54 workflow_templates columns and partial unique index safely"
Task: "Create docs/migrations/rollback-M55.sql with idempotent reverse SQL and preconditions for removing the M55 tasks lineage fields and indexes safely"
Task: "Create docs/migrations/rollback-M56.sql with idempotent reverse SQL and preconditions for removing workspaces.feature_flags safely"
Task: "Create docs/migrations/rollback-M57.sql with idempotent reverse SQL and preconditions for dropping task_dispositions and its indexes safely"
Task: "Create docs/migrations/rollback-M58.sql with idempotent reverse SQL and preconditions for dropping task_artifacts and its indexes safely"
Task: "Create docs/migrations/rollback-M59.sql with idempotent reverse SQL and preconditions for removing only the SPEC-001-created facility workspace row when it can be identified confidently"
Task: "Create docs/migrations/rollback-M60.sql with idempotent reverse SQL and preconditions for dropping resource_policies and its indexes safely"
Task: "Create docs/migrations/rollback-M61.sql with idempotent reverse SQL and preconditions for dropping resource_policy_events and its indexes safely"
```

## Implementation Strategy

### MVP First

1. Complete Setup and Foundational work.
2. Complete User Story 1 to land M53-M61.
3. Validate the first forward migration on a copied database before moving on.

### Incremental Delivery

1. Land M53-M61 and prove the forward pass.
2. Prove rerun/idempotency safety.
3. Add rollback SQL and rehearse manual reversal.
4. Run grep-negative checks and only then update status documents.

## Acceptance Coverage

- P0-AC1: T001, T003, T005-T015, T017
- P0-AC2: T003, T016, T017
- P0-AC3: T005-T007, T016-T017
- P0-AC4: T006, T013, T016-T017
- P0-AC5: T002, T005, T008, T016-T017
- P0-AC6: T002, T005, T009, T017
- P0-AC7: T002, T005, T010, T017
- P0-AC8: T006, T011-T012, T016-T017
- P0-AC9: T006, T014-T015, T016-T017
- P0-AC10: T018
- P0-AC11: T020-T029
- P0-AC12: T019, T029
- P0-AC13: T002, T004, T009, T030-T031
- P0-AC14: T002, T004, T007, T013, T030-T032

## Notes

- `src/lib/schema.sql` remains read-only unless implementation proves a fresh-install gap that is explicitly justified later.
- Tasks introduce one test-only TS file at `src/lib/__tests__/migrations-phase0.test.ts` and no new production TS/TSX modules.
- SPEC-002 `resolveFlag()` and Sandbox cleanup work, plus SPEC-005 `ready_for_owner` runtime behavior, GitHub labels, Kanban, and notifications, are intentionally excluded from this task list.
