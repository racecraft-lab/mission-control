---
up:
  - "[[Mission Control Departmental Architecture - Hub]]"
related:
  - "[[Mission Control Departmental Architecture - PRD]]"
  - "[[Mission Control Departmental Architecture - Decisions]]"
  - "[[Mission Control Departmental Architecture - Current State]]"
created: "2026-04-22"
tags:
  - mission-control
  - technical-roadmap
  - speckit-pro
  - departmental-architecture
  - implementation
status: active
type: technical-roadmap
name: mission-control-departmental-architecture
owner: operator
---

# Mission Control Departmental Architecture — Technical Roadmap

> For SpecKit-Pro ingestion. Companion to [[Mission Control Departmental Architecture - PRD|PRD.md]]. Every phase is ship-safe on its own (additive migrations + feature flags). Phases may be parallelized where dependencies permit; default sequence is linear to minimize risk.

## Guiding Principles

1. **Additive migrations only.** No destructive schema changes. Every migration is individually revertible.
2. **Feature flags for every new runtime behavior.** All flags default OFF. Flipping ON is an explicit operator action per product line.
3. **Ship each phase to production** behind its flag before enabling. Deploy code ≠ activate behavior.
4. **Dev-first, flag-scoped canary on live.** Write and commit changes in `~/mission-control` (dev worktree, `codex/openclaw-nodes-fallback`). Promote via PR merge to `main` → `git fetch` + `pnpm build` + restart `mission-control.service` for `~/mission-control-sync` (the live worktree). The "canary" is a feature flag flipped for ONE workspace (e.g., the facility workspace or a dedicated test workspace) on the live service, validated, then promoted to wider workspaces. There is no separate canary environment on the OpenClaw node; there is ONE live MC and flag-scoping provides the safety.
5. **Upstream compat gate** on every PR: cherry-pick candidates from `builderz-labs/main` should still apply cleanly.

## Phase Map (At a Glance)

| Phase | Title | Ship-safe? | Feature Flag | Blocks |
|---|---|---|---|---|
| 0 | Foundation migrations (M53–M58) | Yes | None — pure schema | — |
| 1 | Product-line switcher + `activeWorkspace` | Yes | `FEATURE_WORKSPACE_SWITCHER` | Phase 7 |
| 2 | Aegis refactor (facility singleton) | Yes (shim) | `FEATURE_GLOBAL_AEGIS` | Phase 3, 7 |
| 3 | Task pipeline engine + routing | Yes | `FEATURE_TASK_PIPELINES` | Phase 4, 7 |
| 4 | `ready_for_owner` state + two-step terminal | Yes | `FEATURE_TWO_STEP_TERMINAL` | Phase 7 |
| 5 | Area-label GitHub sync | Yes | `FEATURE_AREA_LABEL_ROUTING` | Phase 7 |
| 6 | Disposition logging + audit panel | Yes | `FEATURE_DISPOSITION_LOGGING` | Phase 7 |
| 7 | Product Line A pilot — end-to-end smoke | Pilot gate | `PILOT_PRODUCT_LINE_A_E2E` | Phase 8 |
| 8 | Product Line B onboarding | Post-pilot | — | — |

---

## Phase 0 — Foundation Migrations

### Scope

Five additive migrations plus seed. Pure schema work. No runtime behavior changes.

### Deliverables

- **M53** — `agents.scope` column + backfill of Aegis / Security Guardian / OpenClaw to `global`.
- **M54** — rename `agents.workspace_path` → `agents.sandbox_path` (D2 deconfliction).
- **M55** — rebuild `tasks.status` CHECK constraint with `ready_for_owner` added.
- **M56** — `task_templates` gains `output_schema`, `routing_rules`, `next_template_slug`, `produces_pr`, `external_terminal_event`.
- **M57** — `task_dispositions` table + index.
- **M58** — seed `workspaces` with `('facility', 'Facility', tenant_id=1)` row (idempotent).

### Files Touched

- `src/lib/migrations.ts` (append 6 migrations)
- `src/lib/schema.sql` (for reference; sync with migrations)
- `src/types/agent.ts`, `src/types/task.ts`, `src/types/task-template.ts` (add TS fields)

### Acceptance Criteria

- [P0-AC1] All migrations run clean on an existing production-shape database.
- [P0-AC2] Migration is idempotent (re-running applies no changes).
- [P0-AC3] `SELECT * FROM agents WHERE scope='global'` returns the three backfilled globals.
- [P0-AC4] `SELECT * FROM workspaces WHERE slug='facility'` returns exactly one row.
- [P0-AC5] Existing test suite passes unchanged (no new behavior yet).

### Rollback

Each migration has a reverse script (drop column, restore CHECK constraint, drop table, delete seed row). Revert in reverse order.

### Estimated Work

1–2 engineering days. Zero UI, zero runtime logic.

---

## Phase 1 — Product-Line Switcher + `activeWorkspace` Scoping

### Scope

Introduce the product-line switcher in the header, wire Zustand `activeWorkspace`, and apply hybrid filter/aggregate behavior per D4b. Gate everything behind `FEATURE_WORKSPACE_SWITCHER`.

### Deliverables

- **New component**: `src/components/layout/workspace-switcher.tsx`.
  - Dropdown in `header-bar.tsx`.
  - Options: all workspaces user can access (`GET /api/workspaces`) plus "Facility" (null) entry.
  - Persists selection via Zustand.
- **Zustand store**: `activeWorkspace: Workspace | null` with cross-tab sync.
- **TypeScript domain type**: `type ProductLine = Workspace` alias exported from `@/types/product-line`.
- **Filtered panels** (pass `workspace_id` query param when `activeWorkspace` set):
  - `task-board-panel.tsx` — already has `projectFilter`; extend with `workspaceFilter`.
  - `agent-squad-panel-phase3.tsx` — group by Facility → ProductLine → Department → Agent.
  - `project-manager-modal.tsx` — list projects for `activeWorkspace` only.
  - `chat-panel.tsx`, `chat-page-panel.tsx` — list chats from `activeWorkspace`.
  - `skills-panel.tsx` — list skills from `activeWorkspace` + facility (default facility-wide).
- **Aggregate panels** (no change — ignore `activeWorkspace`):
  - `live-feed.tsx`, `notifications-panel.tsx`, `dashboard.tsx`, `system-monitor-panel.tsx`, `audit-trail-panel.tsx`.
- **API endpoints**: accept optional `workspace_id` query param where relevant. Null defaults to aggregate.

### Files Touched (estimated)

- `src/components/layout/header-bar.tsx` (~30 lines added)
- `src/components/layout/workspace-switcher.tsx` (new, ~200 lines)
- `src/store/mission-control-store.ts` (add `activeWorkspace` slice)
- `src/components/panels/task-board-panel.tsx` (~20 lines modified)
- `src/components/panels/agent-squad-panel-phase3.tsx` (~80 lines — hierarchical grouping logic)
- `src/components/panels/project-manager-modal.tsx`, `chat-panel.tsx`, `chat-page-panel.tsx`, `skills-panel.tsx` (minor)
- `src/app/api/tasks/route.ts`, `src/app/api/agents/route.ts`, `src/app/api/projects/route.ts` (accept `workspace_id` query param)
- `src/types/product-line.ts` (new)

### Acceptance Criteria

- [P1-AC1] With flag OFF, UI renders identically to pre-Phase-1. Zero regression.
- [P1-AC2] With flag ON and `activeWorkspace = null`, UI renders identically to flag-OFF (facility view = aggregate).
- [P1-AC3] With flag ON and `activeWorkspace = facility`, every panel (including aggregate ones) includes facility-workspace data.
- [P1-AC4] With flag ON and `activeWorkspace = product-line-a` (pre-seeded), filtered panels show only Product Line A data; aggregate panels show everything.
- [P1-AC5] Agent squad panel renders hierarchical tree: Facility (globals) → Product Line A → {QA, Dev, ...} → {agents}.
- [P1-AC6] Cross-tab state sync: switching in tab A reflects in tab B.

### Rollback

Flip `FEATURE_WORKSPACE_SWITCHER` to OFF. Switcher hidden. Zustand field ignored.

### Estimated Work

5–7 engineering days.

---

## Phase 2 — Aegis Refactor (Facility Singleton)

### Scope

Replace `aegisAgentByWorkspace = new Map<number, ReviewAgentRecord>()` in `task-dispatch.ts` with a global Aegis lookup. Preserve a shim for legacy workspace-scoped Aegis rows. Touch the ~60+ references cataloged during Q1 verification.

### Known Reference Surface (from Q1 verification)

- `src/app/api/tasks/route.ts` — `hasAegisApproval` DB gate
- `src/app/api/tasks/[id]/route.ts`
- `src/lib/validation.ts`
- `src/lib/scheduler.ts` — `aegis_review` cron task
- `src/lib/task-dispatch.ts` — `runAegisReviews`, `resolveGatewayAgentIdForReviewAgent`, `aegisAgentByWorkspace`
- `src/components/panels/task-board-panel.tsx` — Aegis review UI hooks
- `src/components/chat/*` — Aegis chat surfaces

### Deliverables

- **Helper**: `src/lib/aegis.ts` — `getAegis(db, workspace_id?)` returns the global Aegis (scope=global) OR a legacy workspace-scoped Aegis as fallback.
- **Refactor**: `task-dispatch.ts:80` (`resolveGatewayAgentIdForReviewAgent`) + `task-dispatch.ts:376` (`runAegisReviews`) to use `getAegis` instead of the workspace-keyed map.
- **Cleanup**: remove `aegisAgentByWorkspace` map once all callers migrated. Leave legacy-row fallback in `getAegis`.
- **Feature flag**: `FEATURE_GLOBAL_AEGIS` — when OFF, `getAegis` returns workspace-scoped Aegis first (preserves prior behavior); when ON, global first.

### Files Touched

- `src/lib/aegis.ts` (new, ~100 lines)
- `src/lib/task-dispatch.ts` (substantial refactor, ~150 lines modified)
- `src/lib/scheduler.ts` (minor — invoke `runAegisReviews` unchanged)
- `src/app/api/tasks/route.ts`, `src/app/api/tasks/[id]/route.ts` (swap direct Aegis lookups to `getAegis`)
- `src/lib/validation.ts` (minor)
- `src/components/panels/task-board-panel.tsx` + chat panels (minor UI references)

### Acceptance Criteria

- [P2-AC1] With flag OFF, Aegis resolution matches pre-refactor behavior for every workspace (no regression in existing flows).
- [P2-AC2] With flag ON, Aegis resolves to the single `scope='global'` record even when a workspace has no local Aegis.
- [P2-AC3] If a workspace has a legacy local Aegis record, `getAegis(ws)` returns the local one (backward compat). Legacy records can be manually cleaned up later.
- [P2-AC4] `runAegisReviews` scheduler loop runs identically. No new failure modes.
- [P2-AC5] Test suite covers: global-only, workspace-only, workspace-with-legacy (all three scenarios).

### Rollback

Flip `FEATURE_GLOBAL_AEGIS` OFF. `getAegis` reverts to workspace-first resolution.

### Estimated Work

4–5 engineering days. Most of the risk is in the reference sweep, not the logic.

---

## Phase 3 — Task Pipeline Engine + Declarative Routing

### Scope

Extend `task_templates` with routing machinery (per D5). Implement schema validation, routing-rule evaluation, and successor-task creation in the scheduler. Ship behind `FEATURE_TASK_PIPELINES`.

### Deliverables

- **Schema validation library**: `src/lib/output-schema-validator.ts` — JSON Schema draft-07 validator (use `ajv` which is likely already in the tree; verify).
- **Routing expression evaluator**: `src/lib/routing-rule-evaluator.ts` — safe-subset expression language:
  - Operators: `==`, `!=`, `in`, `not in`, `&&`, `||`, `!`.
  - Left-side: JSONPath into output (e.g., `disposition`, `details.severity`).
  - Right-side: literal string, number, boolean, or array of literals.
  - No arbitrary code. No function calls. No arithmetic beyond equality.
- **Scheduler extension**: new `advanceTaskChain` function invoked on successful task completion.
  1. Validate output against `template.output_schema` — fail → task → `failed`.
  2. Evaluate `template.routing_rules` in order — first match wins.
  3. If no rule matches, use `template.next_template_slug`.
  4. If neither resolves, chain terminates normally.
  5. On resolution, create the successor task: inherit `workspace_id`, `project_id`; set `assigned_to` from `project_agent_assignments` matching `template.agent_role`; parametrize description with output variables.
- **Template UI**: extend `settings-panel.tsx` template editor with `output_schema`, `routing_rules`, `next_template_slug` fields (JSON editors for the two JSON fields).

### Files Touched

- `src/lib/output-schema-validator.ts` (new, ~100 lines)
- `src/lib/routing-rule-evaluator.ts` (new, ~200 lines with tests)
- `src/lib/task-dispatch.ts` — add `advanceTaskChain` hook
- `src/lib/scheduler.ts` — call `advanceTaskChain` on successful completion
- `src/components/panels/settings-panel.tsx` — UI for new template fields
- `src/types/task-template.ts` — add new field types

### Acceptance Criteria

- [P3-AC1] With flag OFF, task completion behaves exactly as today (no chain advance regardless of template fields).
- [P3-AC2] With flag ON and all new template fields NULL, behavior matches flag-OFF (null-default safety).
- [P3-AC3] With a template that has `output_schema` set and valid agent output, successor task is created per `routing_rules` / `next_template_slug`.
- [P3-AC4] With a template that has `output_schema` set and INVALID agent output, task transitions to `failed` and no successor is created.
- [P3-AC5] Routing expression evaluator rejects unsafe inputs (function calls, eval, arithmetic beyond ==).
- [P3-AC6] Successor task inherits `workspace_id`, `project_id`; assignee correctly resolved from `project_agent_assignments`.
- [P3-AC7] Unit tests cover: valid routing, invalid output, no-match fallback to static next, chain terminate (no successor).

### Rollback

Flip `FEATURE_TASK_PIPELINES` OFF. `advanceTaskChain` becomes a no-op.

### Estimated Work

7–10 engineering days. Evaluator + schema validation + scheduler wiring + template UI.

---

## Phase 4 — `ready_for_owner` State + Two-Step Terminal Event

### Scope

Add `ready_for_owner` to the task state progression for PR-producing tasks (D6, D7). Integrate with existing GitHub sync to transition `ready_for_owner` → `done` on PR merge.

### Deliverables

- **Kanban UI**: `task-board-panel.tsx` — add `ready_for_owner` column between `quality_review` and `done`. Distinct styling (operator-action-required class).
- **GitHub label**: `github-label-map.ts` — `STATUS_LABEL_MAP.ready_for_owner = 'mc:ready-for-owner'`; `ALL_STATUS_LABEL_NAMES` updated. `initializeLabels` auto-creates the label.
- **Scheduler branching**: `runAegisReviews` — on successful Aegis approval, branch on `template.produces_pr`:
  - `true` → transition to `ready_for_owner`.
  - `false` → transition to `done` (current behavior).
- **GH sync transition**: `pullFromGitHub` — on linked-issue-close event, if task is in `ready_for_owner`, transition to `done`. Existing sync path for other states unchanged.
- **Notification class**: new notification type `task_ready_for_owner` wired into `notifications-panel.tsx`.

### Files Touched

- `src/components/panels/task-board-panel.tsx` — new column (~30 lines)
- `src/lib/github-label-map.ts` — 1 new entry
- `src/lib/github-sync-engine.ts` — new transition rule (~15 lines)
- `src/lib/task-dispatch.ts` — branch in `runAegisReviews` (~15 lines)
- `src/lib/notifications.ts` — new notification type
- `src/components/panels/notifications-panel.tsx` — render new type

### Acceptance Criteria

- [P4-AC1] With flag OFF, Aegis approval transitions tasks to `done` as today (no `ready_for_owner` in the enum used at runtime).
- [P4-AC2] With flag ON and `template.produces_pr = false`, task transitions `quality_review → done` as today.
- [P4-AC3] With flag ON and `template.produces_pr = true`, task transitions `quality_review → ready_for_owner`.
- [P4-AC4] Task in `ready_for_owner` with linked PR merged → `pullFromGitHub` transitions to `done`.
- [P4-AC5] Kanban column renders; operator sees tasks awaiting merge in a dedicated lane.
- [P4-AC6] `mc:ready-for-owner` label appears on linked GitHub issue when MC task enters that state.

### Rollback

Flip `FEATURE_TWO_STEP_TERMINAL` OFF. Scheduler transitions direct to `done` as before. `ready_for_owner` column still renders but remains empty.

### Estimated Work

3–4 engineering days.

---

## Phase 5 — Area-Label GitHub Sync

### Scope

Add `area:*` label routing (D8) so that a single monorepo per product line can serve multiple department kanbans. Behind `FEATURE_AREA_LABEL_ROUTING`.

### Deliverables

- **Label family**: `github-label-map.ts` — `AREA_LABEL_MAP` and `ALL_AREA_LABEL_NAMES`.
- **Label provisioning**: `initializeLabels` creates the `area:*` labels on sync enable (idempotent).
- **Inbound routing**: `pullFromGitHub` on issue ingestion:
  1. Parse `area:*` label from issue labels.
  2. Resolve `(workspace_id, area_slug) → project_id` via a lookup (seed a `projects.area_slug` column or use `projects.slug`).
  3. Set `task.project_id = resolved`.
  4. If no `area:*` label or lookup fails, route to `workspace.inbox_project_id` (pre-existing concept) with `area:triage` tag.
- **Outbound sync**: `pushTaskToGitHub` emits `area:<project_slug>` label alongside `mc:*` and `priority:*`.
- **Template updates**: Pilot templates (Phase 7) emit the correct `area:*` label in their `pushTaskToGitHub` calls.

### Files Touched

- `src/lib/github-label-map.ts` — ~15 lines added
- `src/lib/github-sync-engine.ts` — inbound routing (~40 lines), outbound label emission (~10 lines)
- Migration (optional): add `projects.area_slug TEXT NULL` if slug mismatch between MC project and GitHub label is a concern; else reuse `projects.slug`.

### Acceptance Criteria

- [P5-AC1] With flag OFF, GitHub sync behaves as today (one-to-one task↔issue, single target project per repo).
- [P5-AC2] With flag ON, new issues with `area:qa` label are routed to the QA project; `area:dev` to Dev; etc.
- [P5-AC3] Issues with no `area:*` label route to the workspace's inbox project with an `area:triage` tag.
- [P5-AC4] Task push to GitHub emits `area:<project_slug>` alongside existing label classes.
- [P5-AC5] `initializeLabels` creates the `area:*` labels on the repo and is idempotent.

### Rollback

Flip `FEATURE_AREA_LABEL_ROUTING` OFF. `pullFromGitHub` ignores `area:*` labels; `pushTaskToGitHub` stops emitting them.

### Estimated Work

3–4 engineering days.

---

## Phase 6 — Disposition Logging + Audit Panel Update

### Scope

Log every triage disposition to `task_dispositions` (D9). Extend `audit-trail-panel.tsx` with a disposition view.

### Deliverables

- **Insert hook**: in `advanceTaskChain` (Phase 3), after routing resolution, insert a `task_dispositions` row. Fires for every triage template completion regardless of outcome.
- **Audit panel**: new tab "Dispositions" in `audit-trail-panel.tsx` with filters on `disposition`, `workspace_id`, date range. Pagination for large result sets.
- **Dashboard widget**: simple card in `dashboard.tsx` showing "Last 7d triage totals" per workspace.
- **Morning-briefing integration**: daily-ops morning-prep skill can query this table for the daily briefing (separate repo integration — document only, no code here).

### Files Touched

- `src/lib/task-dispatch.ts` — add INSERT in `advanceTaskChain` (~10 lines)
- `src/components/panels/audit-trail-panel.tsx` — new tab (~80 lines)
- `src/components/dashboard/dashboard.tsx` — new widget (~30 lines)
- `src/app/api/dispositions/route.ts` (new) — GET with filters

### Acceptance Criteria

- [P6-AC1] With flag OFF, no rows inserted into `task_dispositions`.
- [P6-AC2] With flag ON, every triage template completion inserts exactly one row.
- [P6-AC3] Insert failure does not block task advancement (logged to `activities`).
- [P6-AC4] Audit panel renders dispositions with working filters and pagination.
- [P6-AC5] Dashboard widget shows accurate 7-day rollup by disposition.

### Rollback

Flip `FEATURE_DISPOSITION_LOGGING` OFF. INSERT becomes no-op. Table remains; queries return empty for new period.

### Estimated Work

3 engineering days.

---

## Phase 7 — Product Line A Pilot (End-to-End Smoke)

### Scope

Activate every Phase 1–6 feature flag, seed Product Line A workspace + templates + project-agent assignments, and run the pilot on issue #110 (per [[OpenClaw macOS Node - Product Line A Issue Workflow Smoke Plan]]).

### Deliverables

- **Seed script**: `scripts/seed-product-line-a-workspace.ts`:
  - Ensure `facility` workspace exists (idempotent).
  - Create Product Line A workspace (`slug='product-line-a'`, `display_name='Product Line A'`).
  - Create per-department projects (QA, Dev, macOS App, DevSecOps, UI, Marketing, Customer Service).
  - Populate `project_agent_assignments` mapping roles to the six `product-line-a-platform-*` agents.
  - Insert the Product Line A workflow-family templates: `product-line-a_issue_triage`, `product-line-a_remediation_plan`, `product-line-a_specialist_route`, `product-line-a_owner_review`, `product-line-a_close_issue`, `product-line-a_dev_implementation`, `product-line-a_review`.
  - Set `Product Line A workspace.github_repo = '<org>/product-line-a-repo'` (or canonical repo).
- **Flag activation**: enable all Phase 1–6 flags in the product-line scope.
- **Pilot trigger**: label Product Line A issue #110 with `mc:inbox` + `priority:*` + `area:dev` (or appropriate area). Verify:
  - MC ingests it via `pullFromGitHub`.
  - Routes to Product Line A › Dev project.
  - Triage template runs → researcher agent produces structured output.
  - Scheduler advances chain → plan → dev → review → Aegis → ready_for_owner.
  - Operator merges PR on GitHub → task → `done`.
- **Second smoke**: repeat with issue #111 as stronger integration.

### Acceptance Criteria

- [P7-AC1] Issue #110 completes end-to-end without operator intervention beyond final PR merge click.
- [P7-AC2] `task_dispositions` contains the triage record with correct disposition.
- [P7-AC3] Every stage's task has correct `assigned_to` resolved from `project_agent_assignments`.
- [P7-AC4] Aegis approves the dev task and transitions it to `ready_for_owner`.
- [P7-AC5] PR merge triggers `ready_for_owner → done` via `pullFromGitHub`.
- [P7-AC6] Total wall-clock time from issue label to PR-merge-notification is < 4 hours for a simple issue.
- [P7-AC7] Audit trail shows every stage transition.

### Rollback

Per-flag rollback. Worst case: flip `PILOT_PRODUCT_LINE_A_E2E` OFF and revert to explicit operator assignment (Pattern 1 from [[Mission Control - Practical Use of Tasks, Workflows, and Pipelines]]).

### Estimated Work

4–5 engineering days (seed + activation + two real smoke runs + remediation of surprises).

---

## Phase 8 — Product Line B Onboarding (Scale Validation)

### Scope

Onboard Product Line B platform as the second product line. Validate that the architecture scales — < 1 operator-hour from zero to running.

### Deliverables

- **Seed script parameterization**: `scripts/seed-product-line.ts product_line_slug agent_prefix github_repo`. Generalize the Product Line A seed.
- **Agent roster**: spin up `product-line-b-platform-*-dev`, `-ui`, `-qa`, `-devsecops`, `-planner`, `-research` sandboxes (six new docker containers).
- **Template family**: adapt Product Line A templates to Product Line B (likely near-identical; only `agent_role` mappings and repo URL change).
- **GitHub repo**: set `ProductLineB workspace.github_repo = '<org>/product-line-b-repo'` (or canonical repo).
- **First smoke**: a real Product Line B issue flows through the pipeline.

### Acceptance Criteria

- [P8-AC1] End-to-end onboarding (seed + agent provision + first task) completes in < 1 operator-hour.
- [P8-AC2] Product Line B's agents are strictly isolated from Product Line A's (D4a strict-twin verified).
- [P8-AC3] Facility agents (Aegis, Security Guardian) serve both product lines without code change.
- [P8-AC4] Dashboard disposition widget shows metrics per-workspace, demonstrating hybrid switcher behavior works at 2-product-line scale.

### Rollback

Disable Product Line B workspace (set `disabled_at`). Product Line A unaffected.

### Estimated Work

2–3 engineering days.

---

## Dependency Graph

```
Phase 0 (migrations)
    ├─→ Phase 1 (switcher)
    ├─→ Phase 2 (Aegis refactor)
    ├─→ Phase 3 (pipeline engine) ── depends on Phase 2 for global Aegis scheduler hooks
    │        └─→ Phase 4 (ready_for_owner + two-step) ── depends on Phase 3 for produces_pr template field
    │        └─→ Phase 6 (disposition logging) ── depends on Phase 3 for advanceTaskChain hook
    ├─→ Phase 5 (area labels) ── depends on Phase 1 for workspace scoping
    └─→ Phase 7 (Product Line A pilot) ── depends on ALL of Phase 1–6
             └─→ Phase 8 (Product Line B onboarding)
```

Phase 0 MUST land first. Phases 1, 2, 5 can ship in parallel. Phase 3 gates 4 and 6. Phase 7 gates 8.

## Timeline (Aggressive Estimate)

| Phase | Days | Cumulative |
|---|---|---|
| 0 | 1.5 | 1.5 |
| 1 | 6 | 7.5 |
| 2 | 4.5 | 12 |
| 3 | 8.5 | 20.5 |
| 4 | 3.5 | 24 |
| 5 | 3.5 | 27.5 |
| 6 | 3 | 30.5 |
| 7 | 4.5 | 35 |
| 8 | 2.5 | 37.5 |

~7–8 engineering weeks end-to-end for a single engineer working full-time. Multi-engineer parallelism on independent phases (1 + 2 + 5) compresses to ~5–6 weeks.

## Risk Register (linked to PRD §8)

| # | Phase Impacted | Mitigation Owner |
|---|---|---|
| R1 Aegis refactor surface area | Phase 2 | Dedicated phase + comprehensive tests pre-ship |
| R2 Cross-product MEMORY.md bleed | Phase 3, 7, 8 | D4a strict-twin enforced; no global promotion without review |
| R3 Routing-rule expression safety | Phase 3 | FR-D8 safe-subset; evaluator tests include adversarial inputs |
| R4 Schema validation false-positives | Phase 3, 7 | Version `output_schema`; agent prompts reference version |
| R5 GitHub label drift | Phase 5 | `initializeLabels` idempotent; `area:triage` fallback |
| R6 Cross-tab state desync | Phase 1 | Existing MC Zustand cross-tab pattern |
| R7 Disposition table growth | Phase 6 | Acceptable at current scale; revisit at 1M+ rows |
| R8 Feature-flag sprawl | All | Flags default OFF; document in settings-panel |

## Rollback Strategy Summary

Each phase is independently rollback-safe:

- **Schema migrations** (Phase 0) — per-migration reverse scripts.
- **Feature flags** (Phases 1–6) — flip OFF → behavior reverts to pre-phase.
- **Pilot** (Phase 7) — flip `PILOT_PRODUCT_LINE_A_E2E` OFF; workspace remains, templates remain, but the auto-chain stops; operator can fall back to explicit task assignment (Pattern 1).
- **Product-line onboarding** (Phase 8) — `workspace.disabled_at = NOW()`; sync pauses; agents still run but no new work dispatched.

No destructive rollback required at any phase.

## Upstream Compat Checklist (every PR)

- [ ] Does this PR rename any column in `workspaces`, `projects`, `tasks`, or `agents`? If yes, STOP — violates D2.
- [ ] Does this PR modify any upstream-owned file (`src/app/layout.tsx`, `src/lib/auth.ts`, etc.) in a way that would create merge conflicts? If yes, isolate the change to a new file or extend via hooks.
- [ ] Does this PR add new migrations? If yes, they MUST be additive.
- [ ] Does this PR change public API shapes (existing endpoints)? If yes, version the endpoint or preserve the old shape.
- [ ] Feature flag present?

Every phase PR passes through this checklist before merge.
