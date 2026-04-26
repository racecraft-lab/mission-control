# SpecKit Workflow: SPEC-002 - Product-Line Switcher and activeWorkspace Scoping

**Template Version**: 1.0.0
**Created**: 2026-04-26
**Purpose**: Prepare and execute the RC Factory Phase 1 product-line switcher specification in Codex.

---

## How to Use This Workflow

This workflow was generated from the SpecKit Pro workflow template for the dedicated branch `002-product-line-switcher`.

Run the phases through `$speckit-autopilot` unless a human explicitly pauses the run:

```bash
$speckit-autopilot docs/ai/specs/SPEC-002-workflow.md
```

Do not start downstream specs from this worktree. SPEC-002 stops after the feature-flagged Product Line switcher, `activeWorkspace` state, filtered/aggregate REST and SSE scoping, header terminology fix, verification, and roadmap bookkeeping are complete.

---

## Workflow Overview

| Phase | Command | Status | Notes |
|-------|---------|--------|-------|
| Specify | `$speckit-specify` | Pending | Generate `specs/002-product-line-switcher/spec.md` from the Phase 1 roadmap scope |
| Clarify | `$speckit-clarify` | Pending | Resolve state/scoping/UI edge cases before planning |
| Plan | `$speckit-plan` | Pending | Generate plan, research, data model, contracts, and quickstart |
| Checklist | `$speckit-checklist` | Pending | Run state-management, api-contracts, ux, and regression-safety domains |
| Tasks | `$speckit-tasks` | Pending | Generate dependency-ordered tasks with P1-AC1..P1-AC11 coverage |
| Analyze | `$speckit-analyze` | Pending | Verify no dependency, scoping, or feature-flag gaps remain |
| Implement | `$speckit-implement` | Pending | Execute TDD implementation and verification only after analyze passes |

**Status Legend:** Pending | In Progress | Complete | Blocked

### Phase Gates

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G1 | After Specify | Requirements describe Product Line selection, null Facility aggregate, feature flag behavior, and no unresolved `[NEEDS CLARIFICATION]` markers remain |
| G2 | After Clarify | `activeTenant` vs `activeWorkspace`, Facility/null semantics, API authorization, and cross-tab persistence decisions are explicit |
| G3 | After Plan | Constitution gates pass; feature flag resolution, REST/SSE scoping, UI integration, and test strategy are concrete |
| G4 | After Checklist | All state-management, api-contracts, ux, and regression-safety gaps are resolved |
| G5 | After Tasks | P1-AC1 through P1-AC11 have task coverage and tasks are dependency-ordered |
| G6 | After Analyze | No CRITICAL/HIGH findings; tasks do not drift into SPEC-003+ behavior |
| G7 | After Implement | Flag-off regression checks, flag-on scoping tests, Playwright cross-tab check, and docs status pass |

---

## Prerequisites

### Constitution Validation

Before starting any phase, verify alignment with `.specify/memory/constitution.md` and the current roadmap.

| Principle | Requirement | Verification |
|-----------|-------------|--------------|
| Zero-regression contract | With `FEATURE_WORKSPACE_SWITCHER=false`, existing single-workspace behavior and snapshots remain unchanged | `pnpm test:all` with flag OFF, or documented focused fallback if sandbox restrictions block full e2e |
| Feature-flag resolution discipline | New runtime behavior routes through `resolveFlag(name, ctx)` in `src/lib/feature-flags.ts`; inline `process.env.FEATURE_*` checks are forbidden | Grep runtime code for inline feature flag reads and cover `resolveFlag()` behavior with tests |
| Upstream compatibility discipline | SPEC-002 is `upstream-safe`; additions are opt-in and avoid destructive schema/runtime divergence | No SQL renames, no destructive migration, no unnecessary upstream-owned conflict surface |
| Test-first development | Production code changes follow red-green-refactor | Failing Vitest or Playwright tests are added before implementation for state, API, SSE, and UI behavior |
| Strict scope ramp | New production modules in strict scope are limited to `workspace-switcher.tsx`, `product-line.ts`, and `feature-flags.ts` unless the plan justifies more | Plan and tasks list every new TS/TSX production module and keep unrelated cleanup out |
| Package manager | Use pnpm for repo verification | Lockfile is `pnpm-lock.yaml`; use `pnpm` commands only |

**Constitution Check:** Pending. Initial Specify must confirm SPEC-001 is complete and that SPEC-002 is the first runtime feature-flag spec.

---

## Specification Context

### Basic Information

| Field | Value |
|-------|-------|
| Spec | SPEC-002 |
| Name | Product-Line Switcher and activeWorkspace Scoping |
| Branch | `002-product-line-switcher` |
| Dependencies | SPEC-001 |
| Enables | SPEC-003, SPEC-004, SPEC-005, SPEC-006, SPEC-007, SPEC-008, SPEC-009 |
| Priority | P1 |
| Tool count / tool names | N/A; this is not a tool-surface spec |
| Strict Scope | `src/components/layout/workspace-switcher.tsx`, `src/types/product-line.ts`, `src/lib/feature-flags.ts` |
| Source PRD | `docs/rc-factory-v1-prd.md` |
| Source Roadmap | `docs/ai/rc-factory-technical-roadmap.md` |

### Scope Summary

Implement the RC Factory Phase 1 Product Line switcher:

- Add feature-flagged `FEATURE_WORKSPACE_SWITCHER` behavior through `resolveFlag(name, ctx)`.
- Add an independent Zustand `activeWorkspace: Workspace | null` slice for Product Line context.
- Keep `activeTenant` as tenant/facility context; switching product lines must not mutate tenant state.
- Add `src/components/layout/workspace-switcher.tsx` and integrate it into `header-bar.tsx`.
- Stop labeling tenant context as "Workspace" in the header.
- Treat the switcher's "Facility" option as `activeWorkspace = null`, meaning aggregate view, not direct selection of the real `workspaces.slug='facility'` row.
- Persist `activeWorkspace` with Zustand `persist` under key `mc:active-workspace:v1`.
- Add `BroadcastChannel('mc:active-workspace')` cross-tab synchronization, with graceful fallback when unavailable.
- Add `src/types/product-line.ts` with `type ProductLine = Workspace`.
- Add REST scoping for requested workspace/Product Line context on relevant endpoints.
- Add SSE scoping for `/api/events` with authorized selected-workspace and authorized aggregate modes.
- Pass selected workspace scope to filtered panels; aggregate panels ignore it.

### Success Criteria Summary

- [ ] P1-AC1: With flag OFF, existing `pnpm test:all` passes unchanged from the pre-Phase-1 baseline.
- [ ] P1-AC2: With flag ON and `activeWorkspace = null`, existing tests and snapshots remain byte-compatible with flag OFF.
- [ ] P1-AC3: The "Facility" dropdown entry maps to `activeWorkspace = null`, not the real `facility` workspace row; global agents appear across product-line views.
- [ ] P1-AC4: With flag ON and `activeWorkspace = product-line-a`, filtered panels show Product Line A data while aggregate panels show all authorized data.
- [ ] P1-AC5: Agent squad renders Facility globals -> Product Line A -> departments -> agents.
- [ ] P1-AC6: Cross-tab state sync works within 1s via BroadcastChannel, with reload fallback when BroadcastChannel is unavailable.
- [ ] P1-AC7: `activeTenant` remains independent from `activeWorkspace`.
- [ ] P1-AC8: `header-bar.tsx` no longer uses "Workspace" as the tenant-context label.
- [ ] P1-AC9: `/api/tasks`, `/api/agents`, `/api/projects`, and `/api/quality-review` return only authorized requested workspace data and return 403 for unauthorized workspace scope.
- [ ] P1-AC10: `/api/events` returns authorized product-line-filtered events and authorized aggregate events without tenant/access leaks.
- [ ] P1-AC11: `src/store/index.ts` exports an `activeWorkspace` slice wrapped with persist and BroadcastChannel tests.

---

## Phase 1: Specify

**When to run:** Start here. Output: `specs/002-product-line-switcher/spec.md`.

### Specify Prompt

```bash
$speckit-specify

## Feature: SPEC-002 Product-Line Switcher and activeWorkspace Scoping

Create a specification for RC Factory Phase 1 in Mission Control.

### Problem Statement

Mission Control needs a Product Line context that is independent from tenant/facility administration. Operators must be able to switch between a Facility aggregate view and specific product-line workspaces without leaking unauthorized workspace data, changing `activeTenant`, or breaking existing single-workspace deployments. SPEC-001 already created the `workspaces.feature_flags` storage column; SPEC-002 introduces the runtime `resolveFlag()` helper and the first flag-gated behavior that consumes it.

### Users

- Facility operator: needs a Facility aggregate view plus selected product-line views without losing tenant context.
- Department lead: needs product-line-scoped task, agent, project, chat, and skill surfaces.
- Existing single-workspace user: needs current behavior preserved when the feature flag is OFF.
- Downstream spec executor: needs `resolveFlag()` and `activeWorkspace` established before SPEC-003 through SPEC-009.

### User Stories

- US1: As an existing user, I can run Mission Control with `FEATURE_WORKSPACE_SWITCHER=false` and observe no behavior or snapshot changes.
- US2: As a facility operator, I can select Facility and see the authorized aggregate view while global agents remain visible.
- US3: As a department or product-line operator, I can select a product-line workspace and see filtered tasks, agents, projects, chats, and skills for that product line.
- US4: As a multi-tab operator, I can switch product-line context in one tab and see other tabs update or reload into the same selection.
- US5: As a security-conscious tenant admin, I cannot request another tenant's workspace data through REST or SSE scoping parameters.

### Functional Requirements

- Add `src/lib/feature-flags.ts` exporting `resolveFlag(name, ctx)` per the roadmap Feature Flag Resolution Policy.
- Add `FEATURE_WORKSPACE_SWITCHER` with hard-default OFF.
- Read per-workspace overrides from `workspaces.feature_flags JSON`; `NULL` means all runtime flags are OFF.
- Treat `process.env.FEATURE_WORKSPACE_SWITCHER === '0'` as an emergency OFF kill-switch only; do not force ON from env.
- Add a typed `activeWorkspace: Workspace | null` Zustand slice independent from `activeTenant`.
- Persist `activeWorkspace` to localStorage key `mc:active-workspace:v1`.
- Add BroadcastChannel synchronization using `BroadcastChannel('mc:active-workspace')`, with no-op fallback when unavailable.
- Add `src/components/layout/workspace-switcher.tsx` and integrate it into `src/components/layout/header-bar.tsx`.
- Header tenant/facility context must no longer be labeled "Workspace."
- The switcher must list authorized workspaces plus a Facility entry represented as `activeWorkspace = null`.
- The Facility entry must not select the real `workspaces.slug='facility'` row.
- Filtered panels pass selected workspace scope when `activeWorkspace` is non-null.
- Aggregate panels ignore `activeWorkspace` and continue to show all authorized aggregate data.
- Relevant REST endpoints accept optional authorized `workspace_id` scope and reject unauthorized scope with 403.
- `/api/events` supports authorized selected-workspace filtering and authorized aggregate mode without leaking events outside the caller's access set.
- Global agents with `scope='global'` appear across all product-line views.

### Constraints

- Preserve existing behavior with the flag OFF.
- Keep `activeTenant` independent from `activeWorkspace`; never reuse tenant context as product-line context.
- Scope new production modules to `src/components/layout/workspace-switcher.tsx`, `src/types/product-line.ts`, and `src/lib/feature-flags.ts` unless the plan proves another module is necessary.
- Do not implement SPEC-003 Aegis refactor, SPEC-004 task pipeline behavior, SPEC-005 `ready_for_owner`, SPEC-006 area-label routing, SPEC-007 artifact/disposition behavior, or SPEC-008 governance enforcement.
- Use pnpm for verification.

### Out of Scope

- Aegis global singleton behavior beyond rendering already-global agents.
- Task-chain runtime engine, routing rules, schema validation, and successor task creation.
- `ready_for_owner` task state, Kanban lane, GitHub labels, notifications, and PR-merge transition.
- Area-label GitHub sync and repo-level dedupe.
- Disposition logging, artifact store APIs, artifact admin UI, and resource governance.
- Product Line A pilot seeding and Product Line B onboarding.
```

### Specify Results

| Metric | Value |
|--------|-------|
| Functional Requirements | Pending |
| User Stories | Pending |
| Acceptance Criteria | 11 P1 criteria from roadmap |

### Files Generated

- [ ] `specs/002-product-line-switcher/spec.md`

### Traceability Markers

Use these stable references in the generated spec and later tasks:

| Marker | Purpose |
|--------|---------|
| US1 | Flag-off zero regression |
| US2 | Facility aggregate/null workspace behavior |
| US3 | Selected product-line filtered behavior |
| US4 | Cross-tab persistence and synchronization |
| US5 | Authorized REST/SSE scoping |
| P1-AC1..P1-AC11 | Roadmap acceptance criteria |
| FR-FLAG | Feature-flag resolution requirements |
| FR-STATE | Zustand `activeWorkspace` requirements |
| FR-SCOPE | REST/SSE authorization and scoping requirements |

---

## Phase 2: Clarify

**When to run:** After Specify if any ambiguity remains. Keep each session to at most five targeted questions.

### Clarify Prompts

#### Session 1: Product-Line State and Facility Semantics

```bash
$speckit-clarify

Focus on SPEC-002 state semantics only:
- Confirm `activeWorkspace = null` means Facility aggregate view, not selection of `workspaces.slug='facility'`.
- Confirm whether the switcher should show the real facility workspace row or suppress it from selectable product-line options.
- Confirm how global agents should appear when a specific product-line workspace is selected.
- Confirm `activeTenant` remains tenant/facility context and never changes from product-line switching.
- Confirm the initial selected state on first load when no localStorage value exists.
```

#### Session 2: REST and SSE Authorization

```bash
$speckit-clarify

Focus on SPEC-002 API and event scoping:
- Which endpoints must accept `workspace_id` during SPEC-002: `/api/tasks`, `/api/agents`, `/api/projects`, `/api/quality-review`, and any chat/skills endpoints touched by filtered panels?
- What authorization helper or existing access pattern should validate requested `workspace_id`?
- How should null/omitted workspace scope differ between aggregate panels and authenticated-workspace legacy behavior?
- How should `/api/events` filter selected-workspace events while preserving authorized aggregate mode?
- What 403/error shape should unauthorized scope requests return to match existing API patterns?
```

#### Session 3: UI, Persistence, and Regression Boundaries

```bash
$speckit-clarify

Focus on SPEC-002 UI and test boundaries:
- Confirm exact header terminology that replaces the tenant-context "Workspace" label.
- Confirm switcher behavior while `FEATURE_WORKSPACE_SWITCHER=false` and when workspace list loading fails.
- Confirm `BroadcastChannel` fallback behavior when unavailable.
- Confirm which panels are filtered versus aggregate in this spec.
- Confirm whether Playwright snapshot byte-compatibility requires new snapshots or unchanged existing snapshots only.
```

### Clarify Results

| Session | Focus Area | Questions | Key Outcomes |
|---------|------------|-----------|--------------|
| 1 | Product-line state and Facility semantics | Pending | Pending |
| 2 | REST and SSE authorization | Pending | Pending |
| 3 | UI, persistence, and regression boundaries | Pending | Pending |

---

## Phase 3: Plan

**When to run:** After the spec is finalized. Output: `specs/002-product-line-switcher/plan.md`.

### Plan Prompt

```bash
$speckit-plan

## Tech Stack

- Framework: Next.js 16 App Router, React 19, TypeScript 5
- State: Zustand in `src/store/index.ts`; current live store imports `subscribeWithSelector` only
- Database: SQLite via `better-sqlite3`; SPEC-001 added `workspaces.feature_flags`
- Styling: Tailwind CSS 3 and existing component patterns; project AGENTS.md says no icon libraries
- API: Next.js route handlers under `src/app/api`
- Real-time events: `/api/events` SSE route
- Tests: Vitest, Playwright e2e, TypeScript typecheck, ESLint
- Package manager: pnpm

## Constraints

- Strict Scope: `src/components/layout/workspace-switcher.tsx`, `src/types/product-line.ts`, `src/lib/feature-flags.ts`.
- Preserve flag-off behavior and existing snapshots.
- Add `resolveFlag(name, ctx)` before any runtime feature behavior.
- Keep `activeTenant` and `activeWorkspace` as independent state concepts.
- Do not select the real `facility` workspace row through the switcher; Facility means `activeWorkspace = null`.
- Filter only the roadmap-listed filtered panels. Aggregate panels must ignore `activeWorkspace`.
- REST/SSE scope checks must prevent cross-tenant or unauthorized workspace leakage.
- Do not implement downstream specs or task pipeline behavior.

## Architecture Notes

- `src/store/index.ts` is the live store path; there is no `src/store/mission-control-store.ts`.
- The roadmap says no existing `persist` middleware and no existing `BroadcastChannel` listener are present. Implement cross-tab sync from scratch for the `activeWorkspace` slice only.
- `resolveFlag()` reads `workspaces.feature_flags JSON` per workspace; hard-default OFF; env value `0` forces OFF; env value `1` does not force ON.
- Filtered panel list: `task-board-panel.tsx`, `agent-squad-panel-phase3.tsx`, `project-manager-modal.tsx`, `chat-panel.tsx`, `chat-page-panel.tsx`, and `skills-panel.tsx`.
- Aggregate panel list: `live-feed.tsx`, `notifications-panel.tsx`, `dashboard.tsx`, `system-monitor-panel.tsx`, and `audit-trail-panel.tsx`.
- Relevant API endpoints include `/api/tasks`, `/api/agents`, `/api/projects`, `/api/quality-review`, and `/api/events`; inspect chat and skills API call paths before finalizing tasks.

## Verification Strategy

- Add focused Vitest coverage for `resolveFlag()` default, JSON override, env kill-switch, null workspace, malformed JSON, and missing row behavior.
- Add store tests for serialization, localStorage hydrate, BroadcastChannel update, and no-op fallback.
- Add route tests for authorized workspace scope, unauthorized 403, omitted scope legacy behavior, and aggregate mode.
- Add SSE tests for selected-workspace and aggregate authorization behavior.
- Add Playwright coverage for switcher rendering, Facility/null behavior, selected product-line filtering, and cross-tab sync.
- Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and as much of `pnpm test:e2e` or `pnpm test:all` as the environment allows.
```

### Plan Results

| Artifact | Status | Notes |
|----------|--------|-------|
| `plan.md` | Pending | Must record strict scope and feature-flag architecture |
| `research.md` | Pending | Capture state persistence, authorization, and SSE scoping decisions |
| `data-model.md` | Pending | Summarize `ProductLine`, `activeWorkspace`, and flag context data |
| `contracts/` | Pending | REST/SSE request and response contracts for workspace scoping |
| `quickstart.md` | Pending | Document flag-off, Facility/null, selected workspace, and verification commands |

---

## Phase 4: Domain Checklists

**When to run:** After Plan. Run the checklists below and resolve all genuine gaps before Tasks.

### 1. State Management Checklist

```bash
$speckit-checklist state-management

Focus on SPEC-002 requirements:
- `activeWorkspace` is independent from `activeTenant`.
- `activeWorkspace = null` represents Facility aggregate view.
- Zustand persistence uses key `mc:active-workspace:v1`.
- BroadcastChannel sync updates other tabs within 1s and falls back gracefully when unavailable.
- Only the `activeWorkspace` slice changes persistence semantics.
- Pay special attention to hydration ordering, stale localStorage values, and invalid workspace ids.
```

### 2. API Contracts Checklist

```bash
$speckit-checklist api-contracts

Focus on SPEC-002 requirements:
- `/api/tasks`, `/api/agents`, `/api/projects`, `/api/quality-review`, and `/api/events` have explicit workspace-scope contracts.
- Requested `workspace_id` is authorized before use.
- Unauthorized scope returns the repo's normal 403 shape.
- Null/omitted scope behavior preserves legacy authenticated-workspace behavior or authorized aggregate behavior as documented.
- Pay special attention to SSE event leaks across tenant or workspace access boundaries.
```

### 3. UX Checklist

```bash
$speckit-checklist ux

Focus on SPEC-002 requirements:
- Header no longer labels tenant context as "Workspace."
- Product Line switcher appears only when the feature flag is enabled.
- Facility and selected product-line states are visually distinct without explanatory in-app feature text.
- Filtered panels and aggregate panels behave consistently.
- Pay special attention to loading, empty, unauthorized, and workspace-list failure states.
```

### 4. Regression Safety Checklist

```bash
$speckit-checklist regression-safety

Focus on SPEC-002 requirements:
- Flag OFF preserves existing behavior, test counts, and Playwright snapshots.
- Flag ON with `activeWorkspace = null` remains byte-compatible with existing aggregate behavior.
- New tests cover only SPEC-002 behavior and do not encode SPEC-003+ assumptions.
- Grep checks catch inline `process.env.FEATURE_*` reads outside `resolveFlag()`.
- Pay special attention to accidental downstream implementation of Aegis, task pipelines, ready_for_owner, area labels, artifacts, or governance.
```

### Checklist Results

| Checklist | Items | Gaps | Spec References |
|-----------|-------|------|-----------------|
| state-management | Pending | Pending | P1-AC2, P1-AC3, P1-AC6, P1-AC7, P1-AC11 |
| api-contracts | Pending | Pending | P1-AC4, P1-AC9, P1-AC10 |
| ux | Pending | Pending | P1-AC3, P1-AC4, P1-AC5, P1-AC8 |
| regression-safety | Pending | Pending | P1-AC1, P1-AC2, downstream scope boundaries |
| Total | Pending | Pending | All |

### Addressing Gaps

If a checklist reports `[Gap]`, update the generated `spec.md` or `plan.md` with the smallest concrete clarification, then re-run that checklist. Do not resolve a gap by widening SPEC-002 into downstream runtime specs.

---

## Phase 5: Tasks

**When to run:** After checklists pass. Output: `specs/002-product-line-switcher/tasks.md`.

### Tasks Prompt

```bash
$speckit-tasks

## Task Structure

- Small, testable chunks tied to P1-AC1 through P1-AC11.
- Use TDD where feasible: write or update focused Vitest/Playwright tests before implementation.
- Order tasks by dependency:
  1. Baseline inspection and flag-off regression harness.
  2. `resolveFlag()` helper and tests.
  3. `ProductLine` type and `activeWorkspace` store slice with persistence/broadcast tests.
  4. Header terminology fix and `workspace-switcher.tsx` UI.
  5. REST scoping and authorization tests/implementation.
  6. SSE scoping tests/implementation.
  7. Filtered-panel wiring and aggregate-panel regression checks.
  8. Playwright cross-tab and selected-workspace behavior.
  9. Prohibited-drift grep checks, docs status, and final verification.
- Mark parallel-safe tasks with [P] only when they do not touch the same file or state contract.

## Required Task Coverage

- P1-AC1 and P1-AC2 each have explicit flag-off/null-aggregate regression tasks.
- P1-AC3 has tests proving Facility maps to `activeWorkspace = null`.
- P1-AC6 and P1-AC11 cover localStorage and BroadcastChannel behavior.
- P1-AC9 and P1-AC10 cover unauthorized workspace and SSE leak-prevention cases.
- P1-AC8 includes a grep check against `header-bar.tsx` tenant-context label usage.
- Tasks must not implement SPEC-003, SPEC-004, SPEC-005, SPEC-006, SPEC-007, SPEC-008, or SPEC-009 behavior.

## File Layout Constraints

- Primary new files: `src/components/layout/workspace-switcher.tsx`, `src/types/product-line.ts`, `src/lib/feature-flags.ts`.
- Store changes: `src/store/index.ts`.
- Header change: `src/components/layout/header-bar.tsx`.
- Filtered panel changes: `task-board-panel.tsx`, `agent-squad-panel-phase3.tsx`, `project-manager-modal.tsx`, `chat-panel.tsx`, `chat-page-panel.tsx`, `skills-panel.tsx`.
- API changes: inspect and update only relevant routes under `src/app/api`.
- Spec artifacts: `specs/002-product-line-switcher/`.
- Avoid unrelated cleanup and do not touch implementation surfaces outside the SPEC-002 scope unless a failing test proves it is required.
```

### Tasks Results

| Metric | Value |
|--------|-------|
| Total Tasks | Pending |
| Phases | Pending |
| Parallel Opportunities | Pending |
| User Stories Covered | Pending |

---

## Phase 6: Analyze

**When to run:** Always run after Tasks.

### Analyze Prompt

```bash
$speckit-analyze

Focus on:
1. Constitution alignment: feature-flag default OFF, upstream-safe discipline, TDD, strict-scope ramp, and no unauthorized data leaks.
2. Acceptance coverage: P1-AC1 through P1-AC11 each have implementation or verification tasks.
3. State consistency: `activeWorkspace` remains independent from `activeTenant`; Facility/null semantics are not confused with the real facility workspace row.
4. API/SSE consistency: every scoped route has authorization checks and tests for unauthorized scope.
5. Regression discipline: flag-off and null-aggregate behavior preserve existing tests and snapshots.
6. Dependency discipline: generated tasks must not implement Aegis refactor, task pipelines, ready_for_owner, area-label sync, artifacts, governance, or pilot behavior.
7. File-path truthfulness: tasks use the live paths `src/store/index.ts`, `src/components/layout/header-bar.tsx`, and the current API/panel files.
```

### Analyze Severity Levels

| Severity | Meaning | Action Required |
|----------|---------|-----------------|
| CRITICAL | Blocks implementation, violates constitution, leaks unauthorized data, or widens scope into later specs | Must fix before G6 |
| HIGH | Significant gap in acceptance coverage, state semantics, regression checks, or authorization tests | Should fix before implementation |
| MEDIUM | Ambiguity or maintainability risk | Review and decide |
| LOW | Minor wording or traceability issue | Note for cleanup |

### Analysis Results

| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| Pending | Pending | Pending | Pending |

---

## Phase 7: Implement

**When to run:** After tasks are generated and Analyze has no CRITICAL/HIGH findings.

### Implement Prompt

```bash
$speckit-implement

## Approach: TDD-First Product-Line Switcher Implementation

For each task, follow this cycle:

1. RED: Add or update a focused Vitest, route, store, or Playwright test before implementation.
2. GREEN: Implement the smallest feature-flagged behavior that satisfies the task.
3. REFACTOR: Keep state, API scoping, and UI boundaries readable with tests still green.
4. VERIFY: Run the task's acceptance check and keep evidence in the implementation summary.

### Pre-Implementation Setup

1. Verify branch: `git rev-parse --abbrev-ref HEAD` must return `002-product-line-switcher`.
2. Verify package manager: lockfile is `pnpm-lock.yaml`; use pnpm only.
3. Verify SPEC-001 is present in this branch and roadmap marks it complete.
4. Inspect current store/header/API paths:
   - `src/store/index.ts`
   - `src/components/layout/header-bar.tsx`
   - `src/app/api/tasks/route.ts`
   - `src/app/api/agents/route.ts`
   - `src/app/api/projects/route.ts`
   - `src/app/api/quality-review/route.ts`
   - `src/app/api/events/route.ts`
5. Capture baseline tests/snapshots before enabling any new behavior.

### Implementation Notes

- Implement `resolveFlag(name, ctx)` first and route all new runtime behavior through it.
- Keep all flags hard-default OFF.
- Use `workspaces.feature_flags` from SPEC-001 as storage only; do not add new schema unless a fresh, explicit plan proves it is required.
- Add only the `activeWorkspace` persistence behavior; do not wrap unrelated store slices.
- Treat Facility as null aggregate; do not select the real `facility` row in the switcher.
- Preserve `activeTenant`; do not mutate it from switcher actions.
- Filter only panels listed by the roadmap; aggregate panels must ignore selected product-line context.
- Add authorization checks before applying requested `workspace_id` in REST or SSE handlers.
- Do not introduce downstream task-pipeline, Aegis, ready_for_owner, area-label, artifact, governance, or pilot behavior.

### Verification Commands

Run the smallest reliable subset first, then broader checks:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- Focused Vitest filters for `feature-flags`, store persistence/broadcast, scoped API routes, and SSE scoping
- Focused Playwright check for switcher display, Facility/null mode, selected product-line mode, and cross-tab sync
- `pnpm test:e2e` or `pnpm test:all` when the local environment can bind browser/server ports
- Grep checks:
  - no inline runtime `process.env.FEATURE_` reads outside `src/lib/feature-flags.ts`
  - no "Workspace" tenant-context label in `src/components/layout/header-bar.tsx`
  - no downstream `ready_for_owner`, `task_templates`, `area:*`, artifact-store, or governance implementation drift outside roadmap-approved contexts
```

### Implementation Progress

| Phase | Tasks | Completed | Notes |
|-------|-------|-----------|-------|
| 1 - Baseline, flags, and state | Pending | 0 | Pending |
| 2 - Header and switcher UI | Pending | 0 | Pending |
| 3 - REST and SSE scoping | Pending | 0 | Pending |
| 4 - Panel integration | Pending | 0 | Pending |
| 5 - Verification and bookkeeping | Pending | 0 | Pending |

---

## Post-Implementation Checklist

- [ ] All generated tasks are marked complete in `specs/002-product-line-switcher/tasks.md`.
- [ ] `src/lib/feature-flags.ts` implements the Feature Flag Resolution Policy.
- [ ] `src/store/index.ts` contains `activeWorkspace` persistence and BroadcastChannel sync only for the new slice.
- [ ] `src/components/layout/header-bar.tsx` no longer labels tenant context as "Workspace."
- [ ] `src/components/layout/workspace-switcher.tsx` exists and is flag-gated.
- [ ] REST and SSE scoping tests cover authorized and unauthorized workspace requests.
- [ ] Filtered panels respect selected product-line scope; aggregate panels ignore it.
- [ ] `pnpm typecheck` passes or any environment failure is documented with evidence.
- [ ] `pnpm lint` passes or any environment failure is documented with evidence.
- [ ] `pnpm test` passes or any environment failure is documented with evidence.
- [ ] E2E/cross-tab verification passes or sandbox limitations are documented with a successful unsandboxed rerun.
- [ ] Prohibited-drift grep checks pass.
- [ ] `docs/ai/rc-factory-technical-roadmap.md` marks SPEC-002 complete after implementation.
- [ ] `docs/rc-factory-v1-prd.md` reflects SPEC-002 completion after implementation.
- [ ] Branch is pushed for review.

---

## Lessons Learned

### What Worked Well

- Pending.

### Challenges Encountered

- Pending.

### Patterns to Reuse

- Pending.

---

## Project Structure Reference

```text
racecraft-mission-control/
|-- src/lib/feature-flags.ts                 # New SPEC-002 feature flag helper
|-- src/types/product-line.ts                # New ProductLine alias/type surface
|-- src/store/index.ts                       # activeWorkspace slice and cross-tab sync
|-- src/components/layout/header-bar.tsx     # Header integration and terminology fix
|-- src/components/layout/workspace-switcher.tsx
|-- src/components/panels/                   # Filtered and aggregate panel surfaces
|-- src/app/api/                             # REST and SSE scoping surfaces
|-- docs/rc-factory-v1-prd.md                # Product requirements source
|-- docs/ai/rc-factory-technical-roadmap.md  # Roadmap and status source
|-- docs/ai/specs/SPEC-002-workflow.md       # This workflow
|-- specs/002-product-line-switcher/         # Generated SpecKit artifacts
|-- .specify/memory/constitution.md          # Constitution and project rules
`-- .specify/templates/plan-template.md      # Plan template with Strict Scope field
```

---

## Setup Notes

- This workflow is committed on branch `002-product-line-switcher`.
- Run `$speckit-autopilot docs/ai/specs/SPEC-002-workflow.md` from the worktree root.
- Do not run autopilot from `main`.
