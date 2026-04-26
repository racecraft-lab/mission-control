# SpecKit Workflow: SPEC-001 - Foundation Migrations

**Template Version**: 1.0.0
**Created**: 2026-04-25
**Purpose**: Prepare and execute the RC Factory Phase 0 migration-only specification in Codex.

---

## How to Use This Workflow

This workflow was generated from the SpecKit Pro workflow template for the dedicated branch `001-foundation-migrations`.

Run the phases through `$speckit-autopilot` unless a human explicitly pauses the run:

```bash
$speckit-autopilot docs/ai/specs/SPEC-001-workflow.md
```

Do not start downstream specs from this worktree. SPEC-001 stops after the Phase 0 schema tail, rollback files, rollback runbook, verification, and roadmap/PRD bookkeeping are complete.

---

## Workflow Overview

| Phase | Command | Status | Notes |
|-------|---------|--------|-------|
| Specify | `$speckit-specify` | Pending | Generate migration-only spec from roadmap Phase 0 |
| Clarify | `$speckit-clarify` | Pending | Expected to be minimal; resolve only migration-safety ambiguity |
| Plan | `$speckit-plan` | Pending | Produce design artifacts for idempotent migrations and rollback |
| Checklist | `$speckit-checklist` | Pending | Run data-integrity, rollback-safety, and scope-control checks |
| Tasks | `$speckit-tasks` | Pending | Generate dependency-ordered migration and verification tasks |
| Analyze | `$speckit-analyze` | Pending | Must find no CRITICAL issues before implementation |
| Implement | `$speckit-implement` | Pending | TDD-oriented migration implementation and verification |

**Status Legend:** Pending | In Progress | Complete | Blocked

### Phase Gates

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G1 | After Specify | Migration-only spec has clear requirements and no unresolved critical ambiguity |
| G2 | After Clarify | Any schema/rollback ambiguity is resolved or explicitly marked N/A |
| G3 | After Plan | Constitution gates pass; strict scope is N/A; rollback design is explicit |
| G4 | After Checklist | All data-integrity, rollback, and scope gaps are resolved |
| G5 | After Tasks | P0-AC1 through P0-AC14 have task coverage |
| G6 | After Analyze | No CRITICAL findings; no runtime/UI/type work leaked into SPEC-001 |
| G7 | After Implement | Migration tests/smokes pass; rollback files/runbook exist; docs status is updated |

---

## Prerequisites

### Constitution Validation

Before starting any phase, verify alignment with `.specify/memory/constitution.md` and the updated roadmap.

| Principle | Requirement | Verification |
|-----------|-------------|--------------|
| Migration-only profile | SPEC-001 performs schema migrations/seeds, rollback docs, and migration smoke checks only | Generated `plan.md` records `Strict Scope: N/A`; no UI/config/type/runtime files are in scope |
| Schema truthfulness | Do not assert nonexistent tables, columns, or DB constraints | Verify `agents.workspace_path` exists, `tasks.status` has no DB CHECK, `workflow_templates` is the live table, and `workspaces.name` is the live display column |
| Additive safety | No destructive schema changes, no column renames, no status CHECK rebuild | Diff contains no `ALTER TABLE agents RENAME COLUMN`, no `ADD COLUMN sandbox_path`, and no `CHECK (status` change |
| Rollback safety | Every SQL-changing M53-M61 migration or seed has a manual rollback file | `docs/migrations/rollback-M53.sql` through `docs/migrations/rollback-M61.sql` exist and are listed in `docs/migrations/rollback-procedure.md` |
| Strict scope ramp | No new spec-owned TS/TSX production module enters strict scope in SPEC-001 | `tsconfig.spec-strict.json` and `eslint.config.mjs` are unchanged unless a real new TS/TSX module is introduced and explicitly justified |
| Package manager | Use pnpm for repo verification | Lockfile is `pnpm-lock.yaml`; use `pnpm` commands only |

**Constitution Check:** Pending until Specify/Plan output is generated.

---

## Specification Context

### Basic Information

| Field | Value |
|-------|-------|
| Spec | SPEC-001 |
| Name | Foundation Migrations |
| Branch | `001-foundation-migrations` |
| Dependencies | None |
| Enables | SPEC-002; later specs consume Phase 0 schema after SPEC-002 adds `resolveFlag()` |
| Priority | P0 |
| Tool count / tool names | N/A; this is not a tool-surface spec |
| Strict Scope | N/A - migration-only/no-new-module spec |
| Source PRD | `docs/rc-factory-v1-prd.md` |
| Source Roadmap | `docs/ai/rc-factory-technical-roadmap.md` |

### Scope Summary

Implement additive migrations and seed steps M53-M61:

- M53: `agents.scope` column plus global backfill for Aegis, Security Guardian, and HAL.
- M54: `workflow_templates` task-chain and artifact-policy columns: `slug`, `output_schema`, `routing_rules`, `next_template_slug`, `produces_pr`, `external_terminal_event`, `allow_redacted_artifacts`.
- M55: `tasks` workflow-template binding and lineage columns.
- M56: `workspaces.feature_flags JSON`, with NULL meaning all flags default OFF.
- M57: `task_dispositions` table and index.
- M58: `task_artifacts` table and indexes.
- M59: `facility` workspace seed using live `workspaces.name` and a resolved default tenant; do not hardcode `tenant_id=1`.
- M60: `resource_policies` table and scope indexes.
- M61: `resource_policy_events` table and audit indexes.

SPEC-001 also enforces two no-SQL safety gates:

- Sandbox terminology: keep `agents.workspace_path`; do not add `sandbox_path`; do not ship UI/config/type/doc-copy rename work.
- `ready_for_owner`: do not add or rebuild a DB CHECK; do not ship TypeScript/Zod/GitHub-label/Kanban/runtime vocabulary work.

### Success Criteria Summary

- [ ] P0-AC1: All migrations run clean on an existing production-shape database.
- [ ] P0-AC2: Migration is idempotent; re-running applies no changes.
- [ ] P0-AC3: `SELECT * FROM agents WHERE scope='global'` returns the three backfilled globals.
- [ ] P0-AC4: `SELECT slug, name FROM workspaces WHERE slug='facility'` returns exactly one row.
- [ ] P0-AC5: `PRAGMA table_info(workflow_templates)` shows task-chain columns plus `allow_redacted_artifacts`; partial unique index on `(workspace_id, slug)` exists for non-null slugs.
- [ ] P0-AC6: `PRAGMA table_info(tasks)` shows workflow-template binding and lineage columns.
- [ ] P0-AC7: `PRAGMA table_info(workspaces)` shows `feature_flags`; SPEC-001 validates storage only, not runtime flag resolution.
- [ ] P0-AC8: `task_artifacts` is queryable; indexes exist for `(task_id, created_at)` and `(workspace_id, artifact_type)`.
- [ ] P0-AC9: `resource_policies` and `resource_policy_events` are queryable; indexes exist for policy scope and policy events by task/time.
- [ ] P0-AC10: Existing test suite passes unchanged; no behavior yet.
- [ ] P0-AC11: `docs/migrations/rollback-M53.sql` through `docs/migrations/rollback-M61.sql` exist, each with idempotent reverse SQL.
- [ ] P0-AC12: `docs/migrations/rollback-procedure.md` documents reverse order, SQLite DROP COLUMN guidance, and pre-rollback DB snapshot.
- [ ] P0-AC13: SPEC-001 makes no status CHECK or application-level `ready_for_owner` change.
- [ ] P0-AC14: SPEC-001 makes no `agents` column rename, no `sandbox_path`, and no runtime Sandbox copy/type change.

---

## Phase 1: Specify

**When to run:** Start here. Output: `specs/001-foundation-migrations/spec.md`.

### Specify Prompt

```bash
$speckit-specify

## Feature: SPEC-001 Foundation Migrations

Create a migration-only specification for RC Factory Phase 0 in Mission Control.

### Problem Statement

RC Factory v1 requires a compatibility-preserving schema tail before runtime specs can begin. Downstream specs need persistent columns/tables for global agents, workflow-template routing, task lineage, per-workspace feature flags, dispositions, task artifacts, facility workspace seeding, and resource governance. The live migration runner is forward-only, so every SQL-changing migration must also ship documented manual reverse SQL.

### Users

- Facility operator: needs the existing Mission Control install to migrate without downtime or runtime behavior changes.
- Future SpecKit specs: need stable schema surfaces before feature-flagged runtime behavior is implemented.
- Maintainer/operator: needs manual rollback SQL and a procedure for production-shape SQLite databases.

### User Stories

- US1: As an operator, I can apply M53-M61 to an existing production-shape database without breaking existing Mission Control behavior.
- US2: As an operator, I can re-run migrations safely and observe no additional changes.
- US3: As a maintainer, I can manually roll back each SQL-changing M53-M61 migration using checked-in reverse SQL and the runbook.
- US4: As a downstream spec executor, I can rely on the new schema surfaces while all runtime feature flags remain OFF or unimplemented.

### Functional Requirements

- Add M53-M61 as additive, idempotent migrations in `src/lib/migrations.ts` after current id `052`.
- Preserve the live `agents.workspace_path` column; do not add `sandbox_path` or rename `workspace_path`.
- Preserve application-level-only `tasks.status` validation; do not add or rebuild a DB CHECK for `ready_for_owner`.
- Use `workflow_templates`, not a `task_templates` table.
- Use `workspaces.name`, not `workspaces.display_name`.
- Backfill `agents.scope='global'` for `LOWER(name) IN ('aegis','security-guardian','hal')`.
- Seed the `facility` workspace by resolving the default tenant from live data; do not hardcode `tenant_id=1`.
- Add rollback files `docs/migrations/rollback-M53.sql` through `docs/migrations/rollback-M61.sql`.
- Add `docs/migrations/rollback-procedure.md` with reverse order M61 to M53, SQLite DROP COLUMN guidance, and DB snapshot instructions.

### Constraints

- Migration-only: no UI, config, TypeScript type, Zod, GitHub label, Kanban, scheduler, API, CLI, or runtime behavior changes.
- Strict Scope is N/A unless the implementation introduces a new TS/TSX module, which should be avoided for this spec.
- Existing tests must pass unchanged after migrations are added.
- Rollback is manual SQL only; do not add `pnpm mc db rollback` or a `down()` runner.

### Out of Scope

- Product-line switcher and `resolveFlag()` runtime behavior.
- Sandbox UI/config/type/doc-copy cleanup.
- `ready_for_owner` application vocabulary, GitHub labels, notifications, or Kanban lane.
- Task-chain runtime engine, schema validation, routing evaluator, or successor task creation.
- Artifact publish/read APIs, resource-governance evaluator, Cost Tracker UI, OpenClaw health adapter.
```

### Specify Results

| Metric | Value |
|--------|-------|
| Functional Requirements | Pending until Specify completes |
| User Stories | Pending until Specify completes |
| Acceptance Criteria | 14 P0 criteria from roadmap |

### Files Generated

- [ ] `specs/001-foundation-migrations/spec.md`

### Traceability Markers

Use these stable references in the generated spec and later tasks:

| Marker | Purpose |
|--------|---------|
| US1 | Production-shape migration succeeds |
| US2 | Idempotent re-run |
| US3 | Manual rollback coverage |
| US4 | Downstream schema readiness with no runtime behavior |
| P0-AC1..P0-AC14 | Roadmap acceptance criteria |
| M53..M61 | Concrete migration and rollback identities |

---

## Phase 2: Clarify

**When to run:** After Specify if any ambiguity remains. For this migration-only spec, clarify should be short and may resolve to N/A if the roadmap already answers the question.

### Clarify Prompts

#### Session 1: Migration Safety

```bash
$speckit-clarify

Focus on SPEC-001 migration safety only:
- Are all M53-M61 operations additive and idempotent?
- Are any `ALTER TABLE ADD COLUMN` operations unsafe on current SQLite versions or duplicate-column reruns?
- Is the `facility` workspace seed safe when tenants already exist and when no active tenant exists?
- Are index names deterministic and safe on rerun?
- Do not ask about runtime behavior; runtime work is out of scope.
```

#### Session 2: Rollback Safety

```bash
$speckit-clarify

Focus on SPEC-001 rollback safety:
- Does every SQL-changing M53-M61 migration or seed have a matching rollback file?
- Are rollback files idempotent if an operator partially applied or partially reversed a migration?
- Does the rollback procedure require DB snapshot first and reverse order M61 to M53?
- Is there any accidental expectation of an automated rollback CLI or `down()` runner?
```

#### Session 3: Scope Discipline

```bash
$speckit-clarify

Focus on SPEC-001 no-runtime scope:
- Confirm `ready_for_owner` app vocabulary is out of scope except for proving no DB CHECK change.
- Confirm Sandbox UI/config/type/doc-copy rename work is out of scope except for proving no `agents` column rename or `sandbox_path`.
- Confirm `resolveFlag()` runtime behavior belongs to SPEC-002.
- Confirm no new TS/TSX module is expected, so Strict Scope remains N/A.
```

### Clarify Results

| Session | Focus Area | Questions | Key Outcomes |
|---------|------------|-----------|--------------|
| 1 | Migration safety | Pending until Clarify completes | Pending until Clarify completes |
| 2 | Rollback safety | Pending until Clarify completes | Pending until Clarify completes |
| 3 | Scope discipline | Pending until Clarify completes | Pending until Clarify completes |

---

## Phase 3: Plan

**When to run:** After the spec is finalized. Output: `specs/001-foundation-migrations/plan.md`.

### Plan Prompt

```bash
$speckit-plan

## Tech Stack

- Framework: Next.js 16, React 19, TypeScript 5
- Database: SQLite via `better-sqlite3`
- Migrations: `src/lib/migrations.ts`, current live entries `001` through `052`, next id `053`
- Schema reference: `src/lib/schema.sql`; migrations remain authoritative
- Tests: Vitest plus targeted migration smoke checks; package manager is pnpm
- Runtime flags: storage column only in SPEC-001; `resolveFlag()` is SPEC-002

## Constraints

- Strict Scope: N/A - migration-only/no-new-module spec.
- Append M53-M61 to `src/lib/migrations.ts`; do not alter prior migrations unless required for idempotent test support.
- Treat `src/lib/schema.sql` as read-only reference unless fresh-install ordering is explicitly tested and documented.
- No UI, API, scheduler, config, CLI, TypeScript status union, Zod, Kanban, GitHub label, notification, or runtime feature-flag behavior.
- Rollback is manual reverse SQL files plus runbook. No `down()` and no `pnpm mc db rollback`.
- All migrations must be additive or compatibility-preserving.

## Architecture Notes

- Use live schema guards before adding columns or indexes. Existing migration `034_agents_source` conditionally adds `agents.workspace_path`; keep that column unchanged.
- `tasks.status` is `TEXT NOT NULL DEFAULT 'inbox'` without an enforced CHECK; do not add one.
- `workflow_templates` is the live table; never introduce `task_templates`.
- `workspaces.name` is the live display column; never insert into `workspaces.display_name`.
- `project_agent_assignments` is keyed by `agent_name`, not `agent_id`; do not add unrelated assignment migrations in SPEC-001.
- Facility seed resolves tenant via live tenants ordered by active status then id. If no tenant exists, follow the existing default-tenant creation/resolution pattern from migration `029_link_workspaces_to_tenants`.

## Rollback Design

- Create `docs/migrations/rollback-M53.sql` through `docs/migrations/rollback-M61.sql`.
- Each rollback file contains an idempotent reverse block and comments about expected preconditions.
- Create `docs/migrations/rollback-procedure.md` with snapshot, reverse-order, SQLite version, and verification steps.
```

### Plan Results

| Artifact | Status | Notes |
|----------|--------|-------|
| `plan.md` | Pending | Must record Strict Scope N/A |
| `research.md` | Pending | Use for SQLite/idempotency decisions if needed |
| `data-model.md` | Pending | Summarize new columns/tables and rollback mapping |
| `contracts/` | Pending | Usually N/A for migration-only spec |
| `quickstart.md` | Pending | Migration smoke and rollback verification commands |

---

## Phase 4: Domain Checklists

**When to run:** After Plan. Run the checklists below and resolve all genuine gaps before Tasks.

### 1. Data Integrity Checklist

```bash
$speckit-checklist data-integrity

Focus on SPEC-001 requirements:
- M53-M61 are additive, idempotent, and safe on production-shape SQLite data.
- Column/table/index names match live schema truth: `workflow_templates`, `workspaces.name`, `agents.workspace_path`, `tasks.status`.
- Facility seed resolves a default tenant and never hardcodes `tenant_id=1`.
- Partial unique index on `(workspace_id, slug)` for non-null `workflow_templates.slug` is explicit.
- Pay special attention to duplicate-column/index reruns and fresh-install ordering.
```

### 2. Rollback Safety Checklist

```bash
$speckit-checklist rollback-safety

Focus on SPEC-001 requirements:
- Rollback files exist for M53, M54, M55, M56, M57, M58, M59, M60, and M61.
- Rollback files are idempotent and can tolerate already-reversed state where practical.
- `rollback-procedure.md` requires DB snapshot, reverse order M61 to M53, and SQLite DROP COLUMN fallback guidance.
- No automated rollback CLI or `Migration.down` requirement appears in spec, plan, or tasks.
- Pay special attention to table drops versus column drops and seed deletion safety.
```

### 3. Scope Control Checklist

```bash
$speckit-checklist scope-control

Focus on SPEC-001 requirements:
- No UI/config/type/Zod/GitHub-label/Kanban/notification/runtime feature-flag behavior is in scope.
- No `ready_for_owner` app vocabulary implementation appears outside docs that describe the safety gate.
- No `sandbox_path` column, no `agents.workspace_path` rename, and no runtime Sandbox copy/type cleanup.
- Strict Scope remains N/A unless an unavoidable new TS/TSX module is introduced and justified.
- Pay special attention to generated tasks drifting into SPEC-002 or SPEC-005 work.
```

### Checklist Results

| Checklist | Items | Gaps | Spec References |
|-----------|-------|------|-----------------|
| data-integrity | Pending until checklist completes | Pending until checklist completes | P0-AC1..P0-AC10 |
| rollback-safety | Pending until checklist completes | Pending until checklist completes | P0-AC11..P0-AC12 |
| scope-control | Pending until checklist completes | Pending until checklist completes | P0-AC13..P0-AC14 |
| Total | Pending until checklist completes | Pending until checklist completes | All |

### Addressing Gaps

If a checklist reports `[Gap]`, update the generated `spec.md` or `plan.md` with the smallest concrete clarification, then re-run that checklist. Do not resolve a gap by widening SPEC-001 into runtime work.

---

## Phase 5: Tasks

**When to run:** After checklists pass. Output: `specs/001-foundation-migrations/tasks.md`.

### Tasks Prompt

```bash
$speckit-tasks

## Task Structure

- Small, testable chunks tied to P0-AC1 through P0-AC14.
- Use TDD where feasible: write or update migration smoke/idempotency checks before implementation.
- Order tasks by dependency:
  1. Schema truth inspection and test scaffolding
  2. M53-M56 column migrations and indexes
  3. M57-M58 persistence tables and indexes
  4. M59 facility workspace seed
  5. M60-M61 resource policy tables and indexes
  6. Rollback files and rollback procedure
  7. Verification, no-runtime-drift checks, docs status
- Mark parallel-safe rollback-file documentation tasks with [P] only after migration ids are fixed.

## Required Task Coverage

- M53 through M61 each has implementation coverage and rollback coverage.
- P0-AC13 and P0-AC14 each have explicit grep/negative-check tasks.
- Existing test suite or targeted subset is run with pnpm.
- Roadmap and PRD status updates are included only after implementation succeeds.

## File Layout Constraints

- Primary source: `src/lib/migrations.ts`.
- Schema reference: `src/lib/schema.sql` read-only unless explicitly justified.
- Rollback docs: `docs/migrations/rollback-M53.sql` through `docs/migrations/rollback-M61.sql` and `docs/migrations/rollback-procedure.md`.
- Spec artifacts: `specs/001-foundation-migrations/`.
- Avoid new production TS/TSX modules.
```

### Tasks Results

| Metric | Value |
|--------|-------|
| Total Tasks | Pending until Tasks completes |
| Phases | Pending until Tasks completes |
| Parallel Opportunities | Pending until Tasks completes |
| User Stories Covered | Pending until Tasks completes |

---

## Phase 6: Analyze

**When to run:** Always run after Tasks.

### Analyze Prompt

```bash
$speckit-analyze

Focus on:
1. Migration-only constitution alignment: no runtime/UI/type/config/API/CLI behavior slipped into the spec, plan, or tasks.
2. Acceptance coverage: P0-AC1 through P0-AC14 each have implementation or verification tasks.
3. Rollback coverage: every SQL-changing M53-M61 migration or seed has a rollback file task and runbook task.
4. Schema truthfulness: generated artifacts use `workflow_templates`, `workspaces.name`, `agents.workspace_path`, and application-level-only `tasks.status`.
5. Strict-scope consistency: Strict Scope stays N/A unless generated tasks introduce a new TS/TSX file, in which case the plan must be corrected before implementation.
6. Dependency discipline: generated tasks must not implement SPEC-002 `resolveFlag()`, SPEC-002 UI switcher, SPEC-005 `ready_for_owner`, or later runtime behavior.
```

### Analyze Severity Levels

| Severity | Meaning | Action Required |
|----------|---------|-----------------|
| CRITICAL | Blocks implementation, violates constitution, or widens scope into later specs | Must fix before G6 |
| HIGH | Significant gap in migration/rollback/test coverage | Should fix before implementation |
| MEDIUM | Ambiguity or maintainability risk | Review and decide |
| LOW | Minor wording or traceability issue | Note for cleanup |

### Analysis Results

| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| Pending until Analyze completes | Pending until Analyze completes | Pending until Analyze completes | Pending until Analyze completes |

---

## Phase 7: Implement

**When to run:** After tasks are generated and Analyze has no CRITICAL findings.

### Implement Prompt

```bash
$speckit-implement

## Approach: TDD-First Migration Implementation

For each task, follow this cycle:

1. RED: Add or update a focused migration smoke/idempotency check or a documented verification command before implementation.
2. GREEN: Implement the smallest migration, rollback, or runbook change to satisfy the task.
3. REFACTOR: Keep migration helpers readable and consistent with existing `src/lib/migrations.ts` patterns.
4. VERIFY: Run the task's acceptance check and keep evidence in the implementation summary.

### Pre-Implementation Setup

1. Verify branch: `git rev-parse --abbrev-ref HEAD` must return `001-foundation-migrations`.
2. Verify package manager: lockfile is `pnpm-lock.yaml`; use pnpm only.
3. Inspect current migration ids in `src/lib/migrations.ts`; current tail is `052`, so SPEC-001 starts at M53/id `053`.
4. Inspect live schema anchors before coding:
   - `agents.workspace_path` exists in migration `034_agents_source`.
   - `tasks.status` has no DB CHECK.
   - `workflow_templates` is the live table.
   - `workspaces.name` is the live column.
5. Verify `Strict Scope: N/A` in generated `plan.md`.

### Implementation Notes

- Append idempotent migrations for M53-M61; use PRAGMA/table/index existence checks where needed.
- Keep `src/lib/schema.sql` as read-only unless fresh-install ordering is explicitly tested and documented.
- Create rollback files `rollback-M53.sql` through `rollback-M61.sql`; keep them idempotent and operator-readable.
- Create `rollback-procedure.md` with snapshot, reverse order, SQLite DROP COLUMN support/fallback, and smoke verification.
- Do not add `sandbox_path`, do not rename `agents.workspace_path`, and do not change runtime Sandbox copy.
- Do not add `ready_for_owner` to TypeScript/Zod/GitHub-label/Kanban/runtime paths.
- Do not add `resolveFlag()` or any runtime feature-flag behavior.
- Do not add rollback CLI or `Migration.down`.

### Verification Commands

Run the smallest reliable subset first, then broader checks if time permits:

- `pnpm test`
- `pnpm typecheck`
- Targeted migration smoke commands created by the tasks or quickstart
- Grep checks for prohibited runtime drift:
  - no `ALTER TABLE agents RENAME COLUMN`
  - no `ADD COLUMN sandbox_path`
  - no `CHECK (status`
  - no `pnpm mc db rollback`
```

### Implementation Progress

| Phase | Tasks | Completed | Notes |
|-------|-------|-----------|-------|
| 1 - Schema truth and tests | Pending until Tasks completes | 0 | Pending |
| 2 - M53-M56 columns/indexes | Pending until Tasks completes | 0 | Pending |
| 3 - M57-M58 persistence tables | Pending until Tasks completes | 0 | Pending |
| 4 - M59-M61 seeds/policy tables | Pending until Tasks completes | 0 | Pending |
| 5 - Rollback docs/runbook | Pending until Tasks completes | 0 | Pending |
| 6 - Verification/bookkeeping | Pending until Tasks completes | 0 | Pending |

---

## Post-Implementation Checklist

- [ ] All generated tasks are marked complete in `specs/001-foundation-migrations/tasks.md`.
- [ ] `src/lib/migrations.ts` contains idempotent M53-M61 entries only.
- [ ] `docs/migrations/rollback-M53.sql` through `docs/migrations/rollback-M61.sql` exist.
- [ ] `docs/migrations/rollback-procedure.md` exists and documents manual reverse SQL.
- [ ] `pnpm test` passes or any environment failure is documented with evidence.
- [ ] `pnpm typecheck` passes or any environment failure is documented with evidence.
- [ ] Prohibited-drift grep checks pass.
- [ ] `docs/ai/rc-factory-technical-roadmap.md` marks SPEC-001 complete in the spec branch after implementation.
- [ ] `docs/rc-factory-v1-prd.md` reflects SPEC-001 completion after implementation.
- [ ] Branch is pushed for review.

---

## Lessons Learned

### What Worked Well

- Pending until implementation retrospective.

### Challenges Encountered

- Pending until implementation retrospective.

### Patterns to Reuse

- Pending until implementation retrospective.

---

## Project Structure Reference

```text
racecraft-mission-control/
├── src/lib/migrations.ts                 # Authoritative migration runner
├── src/lib/schema.sql                     # Initial schema reference
├── src/lib/__tests__/                    # Vitest tests and migration-adjacent tests
├── docs/rc-factory-v1-prd.md             # Product requirements source
├── docs/ai/rc-factory-technical-roadmap.md
├── docs/ai/specs/SPEC-001-workflow.md    # This workflow
├── docs/migrations/                      # Rollback files and rollback runbook
├── specs/001-foundation-migrations/      # Generated SpecKit artifacts
├── .specify/memory/constitution.md       # Constitution and project rules
└── .specify/templates/plan-template.md   # Plan template with Strict Scope field
```

---

## Setup Notes

- This workflow is committed on branch `001-foundation-migrations`.
- Run `$speckit-autopilot docs/ai/specs/SPEC-001-workflow.md` from the worktree root.
- Do not run autopilot from `main`.
