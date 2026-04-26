# Implementation Plan: SPEC-001 Foundation Migrations

**Branch**: `001-foundation-migrations` | **Date**: 2026-04-25 | **Spec**: `spec.md`
**Input**: Feature specification from `/specs/001-foundation-migrations/spec.md`

## Summary

Append migrations `M53` through `M61` to `src/lib/migrations.ts` to add the RC Factory Phase 0 persistence surfaces only: agent scope, workflow-template routing metadata, task lineage, workspace feature-flag storage, task dispositions, task artifacts, the `facility` workspace seed, and resource-governance tables. Pair every SQL-changing step with checked-in rollback SQL plus a manual rollback runbook, keep all changes additive and rerun-safe, preserve the live schema names already in use, and leave `src/lib/schema.sql` as a read-only reference unless fresh-install ordering is explicitly tested later.

## Technical Context

**Language/Version**: TypeScript 5, SQL, Node.js 22+, Next.js 16  
**Primary Dependencies**: `better-sqlite3`, Next.js 16, React 19, pnpm  
**Storage**: SQLite via `better-sqlite3`; migrations in `src/lib/migrations.ts` remain authoritative, `src/lib/schema.sql` is reference-only  
**Testing**: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, plus targeted migration smoke coverage on a copied SQLite database  
**Target Platform**: Mission Control server runtime on Node.js with a local SQLite database  
**Project Type**: Single-project web application with a server-side migration runner  
**Performance Goals**: One forward pass upgrades a migration `052` database without runtime regressions; an immediate second pass produces no duplicate schema objects or seed rows  
**Constraints**: Append `M53-M61`; do not rename or remove live schema; do not add UI, API, scheduler, config, CLI, TypeScript status union, Zod, GitHub-label, Kanban, notification, or runtime feature-flag behavior; manual rollback only; preserve `agents.workspace_path`, `workflow_templates`, `workspaces.name`, and the current `tasks.status` contract with no DB `CHECK` expansion; and keep any new TypeScript work limited to the planned test-only harness in `src/lib/__tests__/migrations-phase0.test.ts`  
**Scale/Scope**: Nine migration IDs, nine rollback SQL artifacts, one rollback runbook, one new TS test file, and no new TS/TSX production modules  
**Strict Scope**: Test-only `src/lib/__tests__/migrations-phase0.test.ts`; no new production TS/TSX modules, so `tsconfig.spec-strict.json` and `eslint.config.mjs` remain unchanged

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Research Gate

- **Migration-only profile**: PASS. The plan is limited to migration entries, rollback SQL, rollback docs, and migration smoke verification.
- **Schema truthfulness**: PASS. The live repo evidence matches the spec constraints: `workflow_templates` is the existing table in `src/lib/migrations.ts:118`, `workspaces.name` is the live display column in `src/lib/migrations.ts:965`, `agents.workspace_path` is preserved in `src/lib/migrations.ts:1041`, and `tasks.status` remains `TEXT NOT NULL DEFAULT 'inbox'` without a DB `CHECK` in `src/lib/schema.sql:9`.
- **Additive safety**: PASS. No destructive migration, no column rename, no `sandbox_path`, and no `tasks.status` constraint rebuild are planned.
- **Rollback safety**: PASS. The design requires `docs/migrations/rollback-M53.sql` through `docs/migrations/rollback-M61.sql` plus `docs/migrations/rollback-procedure.md`.
- **Strict scope ramp**: PASS. The task plan introduces only the test-only harness `src/lib/__tests__/migrations-phase0.test.ts`; no new spec-owned TS/TSX production modules are planned, so `tsconfig.spec-strict.json` and `eslint.config.mjs` remain unchanged.
- **Package manager**: PASS. The repo uses `pnpm` only.

### Post-Design Re-Check

- **Constitution status**: PASS. The designed artifacts keep scope migration-only, preserve live schema names, keep runtime behavior out of scope, make rollback explicit, and record the test-only TypeScript harness without widening production strict scope.
- **Contracts decision**: PASS. No `contracts/` artifact is generated because SPEC-001 adds internal persistence surfaces only and does not define a new external API, CLI, or protocol contract.

## Project Structure

### Documentation (this feature)

```text
specs/001-foundation-migrations/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
`-- tasks.md              # Phase 2 output; not created in this phase
```

### Source Code (repository root)

```text
src/
`-- lib/
    |-- __tests__/
    |   `-- migrations-phase0.test.ts
    |-- migrations.ts
    `-- schema.sql        # Read-only reference during SPEC-001 planning/implementation

docs/
`-- migrations/
    |-- rollback-M53.sql
    |-- rollback-M54.sql
    |-- rollback-M55.sql
    |-- rollback-M56.sql
    |-- rollback-M57.sql
    |-- rollback-M58.sql
    |-- rollback-M59.sql
    |-- rollback-M60.sql
    |-- rollback-M61.sql
    `-- rollback-procedure.md
```

**Structure Decision**: Keep implementation in the existing single-project layout. The only production code change planned for SPEC-001 is appending the migration tail in `src/lib/migrations.ts`; the only new TypeScript file is the test-only harness `src/lib/__tests__/migrations-phase0.test.ts`; rollback artifacts live under `docs/migrations/`; existing verification commands remain the entry point for regression checks.

## Phase 0 Research Decisions

1. Use live schema guards for every additive migration step. Column additions use `PRAGMA table_info(...)`, table creation uses `CREATE TABLE IF NOT EXISTS`, and index creation uses deterministic names with `CREATE [UNIQUE] INDEX IF NOT EXISTS`.
2. Keep migration ownership in `src/lib/migrations.ts`. Do not edit historical migrations unless a later implementation detail proves a narrowly justified idempotent test-support need.
3. Keep `src/lib/schema.sql` read-only for SPEC-001. It is a reference artifact, not the implementation authority for this migration tail.
4. Prefer compact persistence surfaces over speculative normalization. Use new columns and purpose-built tables only where the spec requires queryable storage or seeded state.
5. Keep rollback operator-driven. The runtime migration chain stays forward-only; rollback lives in checked-in SQL files plus a runbook.

## Phase 1 Design Overview

### Migration Allocation

| Migration | Purpose |
|-----------|---------|
| `M53` | Add `agents.scope` and backfill `global` for Aegis, Security Guardian, and HAL using case-insensitive matching while preserving `agents.workspace_path` |
| `M54` | Extend `workflow_templates` with routing/artifact-policy metadata and create the partial unique index for non-null `(workspace_id, slug)` |
| `M55` | Add task lineage fields to `tasks` for workflow-template origin and predecessor/root relationships |
| `M56` | Add `workspaces.feature_flags` as persistent JSON storage with no runtime behavior attached |
| `M57` | Create `task_dispositions` plus indexes for downstream lookup and auditability |
| `M58` | Create `task_artifacts` plus indexes for chronology and workspace artifact lookup |
| `M59` | Seed the `facility` workspace using live-tenant resolution and rerun-safe insert semantics |
| `M60` | Create `resource_policies` plus indexes for policy-scope queries |
| `M61` | Create `resource_policy_events` plus indexes for task/time audit history |

### Verification Strategy

- Forward migration smoke: apply the normal migration path against a copied migration-`052` SQLite database.
- Rerun smoke: apply the migration path a second time and verify no duplicate columns, indexes, or seed rows.
- Rollback smoke: snapshot first, then apply `rollback-M61.sql` through `rollback-M53.sql` in reverse order on the copied database.
- Repo verification: run the standard `pnpm` build, typecheck, lint, unit, and e2e commands after implementation.
- Phase 5 task generation must stay limited to migrations, rollback artifacts, and migration verification; do not generate tasks for SPEC-002 `resolveFlag()` or Sandbox cleanup work, or for SPEC-005 `ready_for_owner`, GitHub-label, Kanban, or notification behavior.

## Complexity Tracking

No constitution violations are planned or justified for SPEC-001.
