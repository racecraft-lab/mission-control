---
up:
  - "[[Mission Control Departmental Architecture - Hub]]"
related:
  - "[[Mission Control Departmental Architecture - Current State]]"
  - "[[Mission Control Departmental Architecture - Decisions]]"
  - "[[OpenClaw macOS Node - Product Line A Agent Team and Aegis]]"
  - "[[OpenClaw macOS Node - Product Line A Issue Workflow Smoke Plan]]"
  - "[[OpenClaw macOS Node - Mission Control Integration]]"
  - "[[Mission Control - Practical Use of Tasks, Workflows, and Pipelines]]"
created: "2026-04-22"
tags:
  - mission-control
  - prd
  - speckit-pro
  - departmental-architecture
status: active
type: prd
name: mission-control-departmental-architecture
owner: operator
---

# Mission Control Departmental Architecture PRD

> For SpecKit-Pro ingestion. Execute in phases (schema → switcher → Aegis refactor → pipeline engine → state extension → labels → logging → pilot), with **zero regression for existing single-workspace deployments** as the primary acceptance criterion.

## Goal

Extend the `racecraft-lab/mission-control` fork (upstream `builderz-labs/mission-control`) to support a **facility → product-line → department** operating model, starting with Product Line A as the first product line and Quality Assurance as the first department. Enable automated multi-stage workflows (researcher → planner → dev → reviewer → Aegis) while preserving every existing single-workspace deployment byte-compatibly.

## Architecture

Mission Control remains the source of truth. The existing `tenant → workspace → project → task` hierarchy is retained without SQL rename — `workspace` formally represents a **product line** at the UI/domain layer, `project` represents a **department**, and `project_agent_assignments.role` represents the **stage role** an agent plays in a task-chain template.

A new **task pipeline engine** auto-chains tasks based on declarative routing rules evaluated against structured agent output. **Aegis is refactored** from per-workspace resolution to facility-wide via a new `scope='global'` flag on agents. **GitHub sync routes issues** via a new `area:*` label family to the correct department project within a product line's monorepo.

## Tech Stack

- **Existing**: Next.js 16, React 19, TypeScript 5.7, better-sqlite3 (SQLite), Zustand, xyflow/react, reagraph, pnpm, Node ≥22, existing REST + SSE API surface.
- **New**: no runtime dependencies added. Schema additions: one new column on `agents` (`scope`), one new state in `tasks.status` enum (`ready_for_owner`), one new table (`task_dispositions`), three new columns on `task_templates` (`output_schema`, `routing_rules`, `next_template_slug`), one renamed column (`agents.workspace_path` → `agents.sandbox_path`).
- **Testing**: existing Playwright/Vitest patterns + new migration tests + scheduler unit tests for routing + pilot smoke (see Smoke Plan).

---

## 1) Problem Statement

Mission Control's hierarchy supports multi-workspace at the schema layer (52 migrations deep, `workspace_id` on 19 tables) but **not at the UI layer** — no workspace switcher exists in `header-bar.tsx`, `workspace_id: 1` is hardcoded as the auth-fallback in `auth.ts` and `rate-limit.ts`. The mismatch causes:

1. Operators cannot scope their view to one product line. All panels effectively render one workspace.
2. Facility-wide singletons (Aegis, Security Guardian) are resolved per-workspace in `task-dispatch.ts` (`aegisAgentByWorkspace = new Map<number, ReviewAgentRecord>()` — lines ~80, 376), contradicting their design intent per [[OpenClaw macOS Node - Product Line A Agent Team and Aegis]].
3. No native multi-stage task pipeline exists. [[Mission Control - Practical Use of Tasks, Workflows, and Pipelines]] documents explicitly: *"Mission Control does not currently support ... a native same-task multi-agent handoff lane."* Existing `workflows` are single-step prompt templates; existing `pipelines` are operator-supervised ordered bundles, not task-generating.
4. GitHub sync is one-to-one (task ↔ issue) without area-label routing. A monorepo serving multiple department kanbans is not representable.
5. No telemetry for triage dispositions. Operators cannot answer "how many issues did we triage as OBE last week" without manual GitHub scraping.
6. Two colliding senses of "workspace" (tenant hierarchy vs. agent filesystem sandbox) create ambiguity that worsens as the fork evolves.

Result: the fork supports running one product (Product Line A), one department, manually. It cannot operate a factory.

## 2) Product Objectives

### Primary objectives

1. **Departmental object model** — reuse existing hierarchy per D1 (`workspace` = product line, `project` = department, `project_agent_assignments.role` = stage role, `facility` workspace for globals).
2. **Terminology deconfliction** per D2 (UI "Product Line", TS `ProductLine`, SQL `workspace_id` unchanged; agent filesystem renamed "Sandbox").
3. **Facility-wide agent scope** per D3 (add `scope='global'` column; refactor Aegis + Security Guardian + OpenClaw to global).
4. **Product-line switcher** in header-bar with hybrid panel filtering per D4b.
5. **Auto-chained task pipelines** with declarative routing per D5 (extend `task_templates` with `output_schema`, `routing_rules`, `next_template_slug`).
6. **`ready_for_owner` state** per D6; **two-step terminal event** for PR-producing tasks per D7.
7. **Monorepo + area-label GitHub routing** per D8.
8. **Task disposition logging** per D9.
9. **Product Line A GitHub issue remediation workflow family** operational end-to-end (pilot).

### Success criteria

- **[SC-1] Zero-regression** — every existing single-workspace deployment runs unchanged after applying all migrations. `workspace_id=1` fallback preserved. All new behavior feature-flag-guarded or null-default.
- **[SC-2] Pilot end-to-end** — one Product Line A GitHub issue (target: issue #110 per the existing smoke plan) flows **triage → plan → dev → review → Aegis → ready_for_owner → merged (done)** without operator intervention beyond the final PR merge click.
- **[SC-3] Switcher fidelity** — product-line switcher filters `task-board-panel`, `agent-squad-panel`, `chat-panel`, `skills-panel`, `project-manager-modal` to `activeWorkspace`; awareness panels (live feed, notifications, dashboard, system monitor, audit trail) remain aggregate.
- **[SC-4] Global Aegis** — Aegis resolves via `scope='global'` lookup; `aegisAgentByWorkspace` map is either removed or retained only as a backward-compat shim for legacy workspace-scoped Aegis records.
- **[SC-5] Disposition telemetry** — morning-briefing metric "Last 7d: N triaged, X ACTIONABLE, Y OBE, Z DUPLICATE, W NEEDS_SPECIALIST" queryable from `task_dispositions`.
- **[SC-6] Second product line onboarding** — Product Line B platform onboarded in < 1 operator-hour given seed templates (Phase 8 validation).
- **[SC-7] Upstream compat preserved** — cherry-picking from `builderz-labs/mission-control` `main` remains viable (no rename of `workspaces` table or `workspace_id` columns).

### Non-goals (v1)

- Staged same-task multi-agent handoff (rejected — breaks D5 / constraint #2).
- User ACLs per product line (D4e, deferred to v2).
- Cross-product-line agent loan or sharing (D4a rejected — strict twin).
- Mega-monorepo across product lines (D8 explicitly per-product-line monorepo).
- Rename of SQL `workspaces` table (D2 — upstream compat constraint).
- Replacing the web UI with a CLI (out of scope; covered by the separate 2026-03-20 PRD).
- Staged workflows for non-GitHub workflow families (Release Readiness, etc.) — deferred to phase 2+.

## 3) Personas

1. **Facility operator** (`operator` today) — runs multiple product lines, needs focus mode + cross-product awareness. Primary user.
2. **Future product-line owner** — delegate for a single product line. May be ACL-restricted in v2 (D4e deferred).
3. **Autonomous agent** — **subject** of the system, not a user. Consumes templates, produces structured output matching `output_schema`. **Does NOT** create or choose successor templates.
4. **External contributor** — files GitHub issues, receives disposition comments on closure, sees `mc:*` / `area:*` / `priority:*` labels.

## 4) Functional Requirements

### A. Object model & naming (D1, D2)

- **FR-A1:** Three-layer naming scheme enforced. UI + TS domain uses "Product Line" / `ProductLine`. SQL `workspaces` / `workspace_id` unchanged. Agent filesystem column renamed `agents.workspace_path` → `agents.sandbox_path`; UI strings for that concept render as "Sandbox".
- **FR-A2:** `ProductLine` TypeScript type defined as alias/extension of existing `Workspace` type. Exported from `@/types/product-line` and re-exported where convenient.
- **FR-A3:** A dedicated `facility` workspace (slug = `'facility'`) exists for hosting `scope='global'` agents. Seeded on migration; idempotent.
- **FR-A4:** `projects.github_repo` is nullable and not uniqueness-constrained across workspace (already true post-migration 028). Non-code departments (Marketing, Customer Service, Finance) may set `github_repo = NULL` and skip GitHub sync participation.

### B. Agent scope (D3, D4a)

- **FR-B1:** `agents.scope TEXT NOT NULL DEFAULT 'workspace' CHECK (scope IN ('workspace','global'))` added via additive migration.
- **FR-B2:** Backfill migration: `UPDATE agents SET scope='global' WHERE LOWER(name) IN ('aegis','security-guardian','hal')`.
- **FR-B3:** Agent-visibility query replaces single-workspace lookup with `WHERE scope='global' OR workspace_id = :current` across all affected endpoints.
- **FR-B4:** `task-dispatch.ts` Aegis resolution: `aegisAgentByWorkspace` replaced by a single global Aegis lookup; fallback to per-workspace only if a workspace has an explicit legacy local Aegis record.
- **FR-B5:** Cross-product agent sharing is NOT supported by default (D4a strict-twin). A `scope='global'` promotion is the only path to cross-product visibility.

### C. UI — product-line switcher (D1, D4b)

- **FR-C1:** New component `<WorkspaceSwitcher>` in `header-bar.tsx`. Renders a dropdown listing all workspaces the current user has access to, plus a "Facility" (null) entry.
- **FR-C2:** Zustand store gains `activeWorkspace: Workspace | null` with persistence across sessions.
- **FR-C3:** **Filtered panels** (pass `workspace_id` query param when `activeWorkspace` is set):
  - `task-board-panel.tsx`
  - `agent-squad-panel-phase3.tsx`
  - `project-manager-modal.tsx`
  - `chat-panel.tsx`, `chat-page-panel.tsx`
  - `skills-panel.tsx`
- **FR-C4:** **Aggregate panels** (ignore `activeWorkspace`):
  - `live-feed.tsx`
  - `notifications-panel.tsx`
  - `dashboard.tsx`
  - `system-monitor-panel.tsx`
  - `audit-trail-panel.tsx`
- **FR-C5:** Default `activeWorkspace = null` ⇒ every panel aggregate (existing single-workspace UX). Zero-regression guarantee.
- **FR-C6:** Agent squad panel adds hierarchical grouping: **Facility (globals) › ProductLine › Department › Agent**.

### D. Task pipeline engine (D5)

- **FR-D1:** `task_templates` table gains three additive columns: `output_schema JSON`, `routing_rules JSON`, `next_template_slug TEXT NULL`.
- **FR-D2:** Agent output validated against `output_schema` (JSON Schema draft-07 or equivalent) at task-completion time. Invalid output → task → `failed`, chain does not advance. Logged to `activities`.
- **FR-D3:** Routing resolution order on successful completion:
  1. Evaluate `routing_rules` in order; first match wins → create successor task from resolved template slug.
  2. Else if `next_template_slug` set → create successor task from that slug.
  3. Else chain terminates; task remains in terminal success state.
- **FR-D4:** Successor tasks inherit `workspace_id` and `project_id` from the parent task. Assignee resolved by matching `template.agent_role` against `project_agent_assignments` (role-to-agent mapping).
- **FR-D5:** Successor task description parametrized with structured output from the parent task (templated variable substitution).
- **FR-D6:** Templates created by operator (seed scripts + UI editor in `settings-panel.tsx`). Agents MUST NOT create or modify templates. Governance: template write endpoints require operator auth.
- **FR-D7:** Tasks without template binding or with all three fields NULL behave as today — single-step, no chain, zero regression.
- **FR-D8:** Routing-rule expression language: safe-subset boolean expressions over the output JSON (e.g., JSONPath + comparison operators). No arbitrary code execution.

### E. Task state extension (D6)

- **FR-E1:** `tasks.status` enum gains 10th value `ready_for_owner`. CHECK constraint rebuilt via additive migration. Existing rows unaffected.
- **FR-E2:** `github-label-map.ts` — `STATUS_LABEL_MAP.ready_for_owner = 'mc:ready-for-owner'`; `ALL_STATUS_LABEL_NAMES` updated; `initializeLabels` auto-creates the GitHub label on sync.
- **FR-E3:** Kanban panel (`task-board-panel.tsx`) renders `ready_for_owner` as a distinct column between `quality_review` and `done`.
- **FR-E4:** Distinct notification class for `ready_for_owner` transitions (operator action required).

### F. Two-step terminal event (D7)

- **FR-F1:** `task_templates` gains `produces_pr BOOLEAN NOT NULL DEFAULT 0` and `external_terminal_event TEXT NULL`.
- **FR-F2:** Scheduler `runAegisReviews` branches on successful Aegis approval:
  - `template.produces_pr = true` → transition to `ready_for_owner` (NOT `done`).
  - Else → transition to `done` (current behavior).
- **FR-F3:** `github-sync-engine.ts` `pullFromGitHub` on linked-issue-close: if task is in `ready_for_owner`, transition to `done`. If task is in any other non-terminal state, existing behavior applies.
- **FR-F4:** Non-PR-producing templates (triage, plan, review, close_issue) are unaffected — direct `quality_review → done` on Aegis approval.

### G. GitHub sync — monorepo + area labels (D8)

- **FR-G1:** `github-label-map.ts` gains `AREA_LABEL_MAP = { qa, dev, macos, ui, devsecops, marketing, customer_service, ... }`. `ALL_AREA_LABEL_NAMES` exported. Extensible per product line.
- **FR-G2:** `initializeLabels` on sync enablement creates the `area:*` label family in the target repo.
- **FR-G3:** `pullFromGitHub` on issue ingestion:
  1. Read `area:*` label(s) from the issue.
  2. Resolve `(workspace_id, area_slug)` → target `project_id`. If resolution succeeds, `task.project_id = resolved`.
  3. If no `area:*` label OR resolution fails, route to the workspace's inbox project with `area:triage` tag. Researcher then disposes per D5.
- **FR-G4:** `pushTaskToGitHub` on task creation/update: emit `area:<project_slug>` label alongside existing `mc:*` and `priority:*` labels.
- **FR-G5:** Multiple projects within one workspace may share a `github_repo`. No uniqueness constraint introduced.

### H. Disposition logging (D9)

- **FR-H1:** New table `task_dispositions` (schema per D9).
- **FR-H2:** Scheduler writes a row at **every triage template completion**, regardless of successor choice. One INSERT per completion. Failure to write does not block task advancement (logged to `activities`).
- **FR-H3:** `audit-trail-panel.tsx` gains a "Dispositions" view surfacing `task_dispositions` with filters on `disposition`, `workspace_id`, and date range.
- **FR-H4:** Morning-briefing / dashboard query shape (pseudo-SQL):
  ```sql
  SELECT disposition, COUNT(*) FROM task_dispositions
  WHERE workspace_id = :product_line_id
    AND triaged_at >= datetime('now','-7 days')
  GROUP BY disposition;
  ```

### I. Product Line A pilot (pilot)

- **FR-I1:** Seed the `facility` workspace + Product Line A workspace + per-department projects (QA, Dev, macOS App, DevSecOps, UI, Marketing, Customer Service).
- **FR-I2:** Seed the Product Line A workflow family: `product-line-a_issue_triage`, `product-line-a_remediation_plan`, `product-line-a_specialist_route`, `product-line-a_owner_review`, `product-line-a_close_issue`, `product-line-a_dev_implementation`, `product-line-a_review`, `product-line-a_aegis` (Aegis is invoked by scheduler, not a template, but the flow is documented).
- **FR-I3:** Map agent roles to `project_agent_assignments`:
  - `researcher` → `product-line-a-platform-research`
  - `planner` → `product-line-a-platform-planner`
  - `dev` → `product-line-a-platform-dev`
  - `ui` → `product-line-a-platform-ui`
  - `devsecops` → `product-line-a-platform-devsecops`
  - `qa` → `product-line-a-platform-qa`
- **FR-I4:** Point Product Line A workspace's GitHub repo at `<org>/product-line-a-repo` (or `<org>/product-line-a-repo`, whichever is canonical at rollout).
- **FR-I5:** Trigger pilot with issue #110 (per existing [[OpenClaw macOS Node - Product Line A Issue Workflow Smoke Plan]]); second smoke on #111.

## 5) Data Model Changes (Additive Migrations)

### Migration sequence (no destructive changes)

```sql
-- M53: agent_scope
ALTER TABLE agents ADD COLUMN scope TEXT NOT NULL DEFAULT 'workspace'
  CHECK (scope IN ('workspace','global'));
UPDATE agents SET scope='global' WHERE LOWER(name) IN ('aegis','security-guardian','hal');

-- M54: agent_sandbox_rename
ALTER TABLE agents RENAME COLUMN workspace_path TO sandbox_path;

-- M55: task_status_ready_for_owner
-- (SQLite enum is CHECK constraint — rebuild the constraint via swap table)

-- M56: task_templates_routing
ALTER TABLE task_templates ADD COLUMN output_schema JSON;
ALTER TABLE task_templates ADD COLUMN routing_rules JSON;
ALTER TABLE task_templates ADD COLUMN next_template_slug TEXT NULL;
ALTER TABLE task_templates ADD COLUMN produces_pr BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE task_templates ADD COLUMN external_terminal_event TEXT NULL;

-- M57: task_dispositions
CREATE TABLE task_dispositions (
  id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  disposition TEXT NOT NULL,
  reason TEXT,
  triaged_by_agent_id INTEGER REFERENCES agents(id),
  triaged_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id)
);
CREATE INDEX idx_task_dispositions_workspace_triaged_at
  ON task_dispositions(workspace_id, triaged_at);

-- M58: facility_workspace_seed
INSERT OR IGNORE INTO workspaces (slug, display_name, tenant_id)
  VALUES ('facility', 'Facility', 1);
```

## 6) Non-Functional Requirements

- **NFR-1 Zero regression:** existing deployments pre-migration state is reachable post-migration (null `activeWorkspace`, null `next_template_slug`, non-`global` agent scopes). Every new behavior is additive or feature-flag-guarded.
- **NFR-2 Upstream compat:** `workspaces` table not renamed. `workspace_id` columns not renamed. Cherry-picks from `builderz-labs/main` remain viable.
- **NFR-3 Single-agent primacy:** each task still has one `assigned_to`, one status, one kanban card. The pipeline is a relationship between tasks, not a state of a task.
- **NFR-4 Governance:** agents cannot create, modify, or choose successor templates. Template write endpoints require operator auth. Invalid structured output breaks the chain deterministically.
- **NFR-5 Observability:** every triage disposition logged. Every state transition auditable via existing `activities` and new `task_dispositions`.
- **NFR-6 Performance:** routing-rule evaluation and schema validation MUST NOT increase task-completion latency by more than 50ms at p95 (one-shot per completion).
- **NFR-7 Rollback-safe:** each migration is individually revertible. Feature flags (`enable_workspace_switcher`, `enable_task_pipelines`, etc.) allow shipping code without activating new behavior.

## 7) Constraints (from Hub)

1. Zero regressions for existing users.
2. Preserve single-agent as the primary working mode.
3. Departmental / staged-handoff behavior opt-in, feature-flagged, or null-default.
4. Aegis is a global facility-wide singleton (D3 formalizes this).
5. Preserve `builderz/main` upstream compatibility (D2 enforces this).

## 8) Risks & Mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | Aegis refactor (per-workspace → global) touches ~60+ references across `tasks/route.ts`, `scheduler.ts`, `validation.ts`, `task-dispatch.ts`, `task-board-panel.tsx`, chat components | Dedicated refactor phase (Phase 2) with comprehensive test coverage before any other multi-workspace behavior ships. Maintain a shim for legacy workspace-Aegis records. |
| R2 | Cross-product MEMORY.md context bleed if `scope='global'` is over-applied | D4a strict-twin is the default. Global promotion is per-agent, explicit, reviewed. |
| R3 | Routing-rule expression safety — arbitrary eval in rule evaluation | FR-D8 mandates safe-subset expression language (JSONPath + comparisons), no runtime eval. |
| R4 | Template schema validation false-positives (agent output almost-right but schema-strict) | Schema evolution: maintain version field on `output_schema`; agent prompts reference schema version. |
| R5 | GitHub area-label drift (labels deleted in repo, or operator renames) | `initializeLabels` runs on sync enable and is idempotent; label absence triggers `area:triage` fallback (FR-G3). |
| R6 | `activeWorkspace` state desync between browser tabs | Zustand persisted state + cross-tab sync (existing MC pattern for other store slices). |
| R7 | Disposition logging table grows unboundedly | Acceptable at current scale; revisit partitioning at 1M+ rows. Index on `(workspace_id, triaged_at)` supports range queries. |
| R8 | Feature-flag sprawl — too many flags, unclear defaults | All new flags default to OFF; flipping ON is a manual operator decision per product line. |

## 9) Open Questions (deferred)

- **D4c — Chat history isolation** (default: product-line-scoped for non-global agents, cross-product for globals; formalize during implementation).
- **D4d — Skills library isolation** (default: facility-wide skills with per-product-line opt-out).
- **D4e — User ACLs per product line** (v2, not in this PRD).

## 10) Phased Rollout

Detailed phasing in [[Mission Control Departmental Architecture - Technical Roadmap]]. Summary:

| Phase | Scope | Ship-safe? |
|---|---|---|
| 0 | Foundation migrations (M53–M58) | Yes — all additive |
| 1 | Workspace switcher + `activeWorkspace` scoping | Yes — flag-off default |
| 2 | Aegis refactor (facility singleton) | Yes — shim preserves legacy |
| 3 | Task template engine + routing | Yes — null-default fields |
| 4 | `ready_for_owner` state + two-step terminal | Yes — per-template opt-in |
| 5 | Area labels + GitHub sync updates | Yes — fallback to `area:triage` |
| 6 | Disposition logging + audit panel update | Yes — purely additive |
| 7 | Product Line A pilot (issue #110, then #111) | Gated behind pilot feature flag |
| 8 | Second product line onboarding (Product Line B) | Post-pilot |

## 11) Success Measurement

- Every single-workspace deployment passes the existing test suite post-migration: **PASS gate**.
- Product Line A issue #110 completes end-to-end through the pipeline with no operator intervention beyond PR merge: **PILOT gate**.
- Disposition dashboard shows 7-day rollup for at least one product line: **TELEMETRY gate**.
- Second product line onboarding completes in < 1 operator-hour: **SCALE gate**.
