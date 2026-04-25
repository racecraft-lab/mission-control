---
up:
  - "[[Mission Control Departmental Architecture - Hub]]"
related:
  - "[[Mission Control Departmental Architecture - Current State]]"
  - "[[Mission Control Departmental Architecture - Decisions]]"
  - "[[OpenClaw macOS Node - FocusEngine Agent Team and Aegis]]"
  - "[[OpenClaw macOS Node - FocusEngine Issue Workflow Smoke Plan]]"
  - "[[OpenClaw macOS Node - Mission Control Integration]]"
  - "[[Mission Control - Practical Use of Tasks, Workflows, and Pipelines]]"
created: "2026-04-22"
tags: [mission-control, prd, speckit-pro, departmental-architecture]
status: active
type: prd
name: mission-control-departmental-architecture
owner: fgabelmannjr
---

# Mission Control Departmental Architecture PRD

> For SpecKit-Pro ingestion. Execute in phases (schema → switcher → Aegis refactor → pipeline engine → state extension → labels → logging → governance → pilot), with **zero regression for existing single-workspace deployments** as the primary acceptance criterion and **explicit upstream-impact disclosure** for every phase.

## SpecKit-Pro Usage

This PRD is the product and architecture source of truth for the Mission Control departmental architecture.

The companion technical roadmap at `docs/ai/rc-factory-technical-roadmap.md` defines spec sequencing, dependency order, and the individual autopilot execution units used by SpecKit-Pro setup and autopilot. Wikilinks (`[[…]]`) elsewhere in this PRD point to companion notes in the operator's Obsidian vault and are NOT required for autopilot ingestion; consensus agents should treat them as informational only.

Workflow files under `docs/ai/specs/SPEC-*-workflow.md` are execution records created by SpecKit-Pro setup/autopilot for individual specs. They should capture per-spec prompts, phase outputs, gate results, implementation notes, and completion status.

This PRD should preserve the durable **why**, **what**, **success criteria**, and **constraints** for the architecture. It should not become the per-spec execution ledger or duplicate the detailed workflow records.

## Goal

Extend the `racecraft-lab/mission-control` fork (upstream `builderz-labs/mission-control`) to support a **facility → product-line → department** operating model, starting with FocusEngine as the first product line and Quality Assurance as the first department. Enable automated multi-stage workflows (researcher → planner → dev → reviewer → Aegis) while preserving every existing single-workspace deployment byte-compatibly.

## Architecture

Mission Control remains the source of truth. The existing `tenant → workspace → project → task` hierarchy is retained without SQL rename — `workspace` formally represents a **product line** at the UI/domain layer, `project` represents a **department**, and `project_agent_assignments.role` represents the **stage role** an agent plays in a task-chain template.

A new **task pipeline engine** auto-chains tasks based on declarative routing rules evaluated against structured agent output. **Aegis is refactored** from per-workspace resolution to facility-wide via a new `scope='global'` flag on agents. **GitHub sync routes issues** via a new `area:*` label family to the correct department project within a product line's monorepo. **Resource governance** extends the existing Cost Tracker into enforceable WIP limits, blackout/degraded windows, and budget gates before autonomous work is started. Facility electricity / infrastructure usage and cost from HAL's OpenClaw health cron are part of the same governance surface, but only through a fork-only optional adapter.

## Tech Stack

- **Existing**: Next.js 16, React 19, TypeScript 5.7, better-sqlite3 (SQLite), Zustand, xyflow/react, reagraph, pnpm, Node ≥22, existing REST + SSE API surface.
- **New**: one explicit pinned runtime dependency for schema validation (`ajv`, direct dependency only; never import transitive packages). Schema additions: one new column on `agents` (`scope`), one new state value in the task-status vocabulary (`ready_for_owner`, DB CHECK enforcement only if the live schema proves status is CHECK-constrained), four new tables (`task_dispositions`, `task_artifacts`, `resource_policies`, `resource_policy_events`), a feature-flag storage column on `workspaces` (`feature_flags JSON`), routing/chain columns on `workflow_templates`, and task-chain binding/lineage columns on `tasks`. Agent filesystem "workspace" terminology is renamed to "Sandbox" at UI/config level unless the live DB schema proves an `agents.workspace_path` column exists. HAL/OpenClaw electricity / infra cost support is **not** a schema feature in v1; it is a runtime-only optional adapter.
- **Testing**: existing Playwright/Vitest patterns + new migration tests + scheduler unit tests for routing + pilot smoke (see Smoke Plan).

---

## Upstream Compatibility Contract

This PRD now follows D13: **Upstream-First Extension Discipline**.

Every major feature and every roadmap phase must be classified as one of:

| Class | Meaning |
|---|---|
| `upstream-safe` | additive, opt-in, and reasonable to upstream |
| `upstream-divergent` | preserves runtime compatibility for current installs but creates schema/state/API divergence that increases permanent-fork pressure unless upstream accepts it |
| `fork-only optional` | HAL/OpenClaw/local-environment-specific integration that must be absent-safe, config-gated, and disabled by default |

Non-negotiable rules:

1. **If a change is upstream-divergent, the docs must say so plainly before implementation.**
2. **HAL/OpenClaw-only features must be adapters, not required core behavior.**
3. **If an upstream-safe adapter exists, prefer it over a schema divergence.**
4. **"Additive migration" does not equal "upstream-safe."** It only means existing deployments are less likely to break at runtime.
5. **OpenClaw health electricity/infra support is fork-only optional in v1.** If the health files/config are absent, Mission Control must behave exactly as it does today.

## 1) Problem Statement

Mission Control's hierarchy supports multi-workspace at the schema layer (50 migrations applied, latest id `052`, `workspace_id` propagated to 19+ scoped tables) but **not at the UI/request layer**. The live client store at `src/store/index.ts` has `activeTenant` and `activeProject`, but no `activeWorkspace`; `activeTenant` is a super-admin / tenant context, not the Product Line switcher. The current header (`src/components/layout/header-bar.tsx:320`) visually labels tenant context as "Workspace," which must stop. Core APIs and the SSE stream primarily scope to `auth.user.workspace_id`, so a client-side dropdown alone cannot select a different product line. The mismatch causes:

1. Operators cannot scope their view to one product line. All panels effectively render the authenticated workspace.
2. Facility-wide singletons (Aegis, Security Guardian) are resolved per-workspace in `src/lib/task-dispatch.ts` — the function `runAegisReviews` starts at line 376 and declares `aegisAgentByWorkspace = new Map<number, ReviewAgentRecord>()` at line 394, with `.get()` at line 422 and `.set()` at line 435; `resolveGatewayAgentIdForReviewAgent` at line 80 also keys lookups by workspace. This contradicts the global-singleton design intent recorded in the operator's vault (informational reference; not required for autopilot ingestion).
3. No native multi-stage task chain exists. The orchestration patterns reference (`docs/orchestration.md` in this repo, plus the operator's vault notes) documents this explicitly: Mission Control does not currently support a native same-task multi-agent handoff lane. Existing `workflows` are single-step prompt templates backed by the live `workflow_templates` table; existing `pipelines` are operator-supervised ordered bundles, not task-generating.
4. GitHub sync is project-driven (`pullFromGitHub(project, workspaceId)`), which can duplicate ingestion when many department projects share one monorepo unless repo-level ownership or dedupe is introduced.
5. No telemetry for triage dispositions. Operators cannot answer "how many issues did we triage as OBE last week" without manual GitHub scraping.
6. Two colliding senses of "workspace" (tenant/product-line hierarchy vs. agent filesystem sandbox) create ambiguity that worsens as the fork evolves.

Result: the fork supports running one product (FocusEngine), one department, manually. It cannot operate a factory.

## 2) Product Objectives

### Primary objectives

1. **Departmental object model** — reuse existing hierarchy per D1 (`workspace` = product line, `project` = department, `project_agent_assignments.role` = stage role, `facility` workspace for globals).
2. **Terminology deconfliction** per D2 (UI "Product Line", TS `ProductLine`, SQL `workspace_id` unchanged; agent filesystem renamed "Sandbox").
3. **Facility-wide agent scope** per D3 (add `scope='global'` column; refactor Aegis + Security Guardian + HAL to global).
4. **Product-line switcher** in header-bar with hybrid panel filtering per D4b.
5. **Auto-chained task chains** with declarative routing per D5. A "task-chain template" is a domain alias over the live `workflow_templates` table, not a new SQL table. Phase 0 must add explicit workflow-template identity, task binding, and task-chain lineage before implementation.
6. **`ready_for_owner` state** per D6; **two-step terminal event** for PR-producing tasks per D7.
7. **Monorepo + area-label GitHub routing** per D8, with repo-level sync ownership/dedupe so shared department projects do not ingest the same issue multiple times.
8. **Task disposition logging** per D9.
9. **Shared task artifact store** per D11.
10. **Resource governance** per D12, reusing Cost Tracker data to enforce WIP limits, blackout/degraded windows, and budgets.
11. **FocusEngine GitHub issue remediation workflow family** operational end-to-end (pilot).

### Success criteria

- **[SC-1] Zero-regression** — every existing single-workspace deployment runs unchanged after applying all migrations. `workspace_id=1` fallback preserved. All new behavior feature-flag-guarded or null-default.
- **[SC-2] Pilot end-to-end** — one FocusEngine GitHub issue (target: issue #110 per the existing smoke plan) flows **triage → plan → dev → review → Aegis → ready_for_owner → linked PR merged (done)** without operator intervention beyond the final PR merge click.
- **[SC-3] Switcher fidelity** — product-line switcher filters `task-board-panel`, `agent-squad-panel`, `chat-panel`, `skills-panel`, `project-manager-modal` to `activeWorkspace`; awareness panels (live feed, notifications, dashboard, system monitor, audit trail) remain aggregate.
- **[SC-4] Global Aegis** — Aegis resolves via `scope='global'` lookup; `aegisAgentByWorkspace` map is either removed or retained only as a backward-compat shim for legacy workspace-scoped Aegis records.
- **[SC-5] Disposition telemetry** — morning-briefing metric "Last 7d: N triaged, X ACTIONABLE, Y OBE, Z DUPLICATE, W NEEDS_SPECIALIST" queryable from `task_dispositions`.
- **[SC-6] Second product line onboarding** — Racecraft Lab platform onboarded in < 1 operator-hour given seed templates (Phase 9 validation).
- **[SC-7] Upstream compat preserved** — cherry-picking from `builderz-labs/mission-control` `main` remains viable (no rename of `workspaces` table or `workspace_id` columns).
- **[SC-8] Artifact handoff durability** — researcher/planner/dev/reviewer/Aegis handoffs are persisted in `task_artifacts`; downstream agents consume MC artifact references rather than reading another agent's sandbox.
- **[SC-9] Resource governance safety** — WIP, blackout/degraded window, and budget policies block or defer new autonomous work before scheduler dispatch, while Cost Tracker continues to show spend/usage and policy decisions.
- **[SC-10] Blended cost visibility** — Cost Tracker shows both token/API spend and facility electricity/infra spend from OpenClaw health telemetry, with combined totals available for governance and operator review.
- **[SC-11] Upstream impact transparency** — every roadmap phase and every major feature is labeled `upstream-safe`, `upstream-divergent`, or `fork-only optional`.
- **[SC-12] OpenClaw health absence safety** — installs without HAL/OpenClaw health cron artifacts continue to function with no config errors, API breakage, or UI regressions.
- **[SC-13] Successor sync parity** — every successor task created by `advanceTaskChain` triggers the same outbound side effects as standard task creation, including GitHub issue creation/update and GNAP push where configured.
- **[SC-14] Product-line request scoping** — filtered REST endpoints and `/api/events` support an authorized requested workspace/product-line scope; facility view supports authorized aggregate events across the tenant's workspaces.

### Non-goals (v1)

- Staged same-task multi-agent handoff (rejected — breaks D5 / constraint #2).
- User ACLs per product line (D4e, deferred to v2).
- Cross-product-line agent loan or sharing (D4a rejected — strict twin).
- Mega-monorepo across product lines (D8 explicitly per-product-line monorepo).
- Rename of SQL `workspaces` table (D2 — upstream compat constraint).
- Replacing the web UI with a CLI (out of scope; covered by the separate 2026-03-20 PRD).
- Staged workflows for non-GitHub workflow families (Release Readiness, etc.) — deferred to phase 2+.
- Silently normalizing HAL/OpenClaw-only assumptions into upstream Mission Control core behavior.

## 3) Compatibility Snapshot

This is the current honest fork-pressure picture.

### Likely `upstream-safe` or at least upstreamable

- Product-line switcher UI and `activeWorkspace` scoping
- Area-label GitHub routing
- Optional feature-flagged governance hooks
- Runtime-only optional OpenClaw health cost adapter

### Explicitly `fork-only optional`

- Reading electricity / infra telemetry from `~/.openclaw/health/readings.jsonl`
- Reading `~/.openclaw/health/current-rate.json`
- Reading `~/.openclaw/health/cost.json`
- Any UI or API surfaces that render those HAL/OpenClaw-specific cost metrics

### Explicitly `upstream-divergent` unless upstream accepts them

- `agents.scope` column
- `workspaces.feature_flags` column
- task-chain binding/lineage columns on `tasks`
- task-status vocabulary gaining `ready_for_owner` (DB CHECK change only if live schema verifies one exists)
- `workflow_templates` gaining slug/routing/output/terminal-event columns for task-chain use
- `task_dispositions` table
- `task_artifacts` table
- `resource_policies` and `resource_policy_events` tables

If those schema/state changes are unacceptable as long-term fork pressure, the implementation strategy must change before coding starts.

Agent filesystem "Sandbox" terminology is UI/config-level in v1 unless a live schema inspection proves an `agents.workspace_path` column exists. A DB column rename is not currently assumed.

## 4) Personas

1. **Facility operator** (`fgabelmannjr` today) — runs multiple product lines, needs focus mode + cross-product awareness. Primary user.
2. **Future product-line owner** — delegate for a single product line. May be ACL-restricted in v2 (D4e deferred).
3. **Autonomous agent** — **subject** of the system, not a user. Consumes templates, produces structured output matching `output_schema`. **Does NOT** create or choose successor templates.
4. **External contributor** — files GitHub issues, receives disposition comments on closure, sees `mc:*` / `area:*` / `priority:*` labels.

## 5) Functional Requirements

### A. Object model & naming (D1, D2)

- **FR-A1:** Three-layer naming scheme enforced. UI + TS domain uses "Product Line" / `ProductLine` for SQL workspaces. SQL `workspaces` / `workspace_id` unchanged. Agent filesystem workspace terminology renders as "Sandbox" in UI/config copy. The live schema (verified 2026-04-24 at `src/lib/migrations.ts:1041-1042`) DOES contain `agents.workspace_path`. v1 decision: **keep the SQL column name as-is** (`agents.workspace_path`); rename only UI labels, config keys, TypeScript type names (`AgentSandbox`), error messages, log strings, and external doc copy. v1 ships **NO** `ALTER TABLE agents RENAME COLUMN` and **NO** `ADD COLUMN sandbox_path`. A future spec may revisit this if upstream parity becomes a hard requirement.
- **FR-A1a:** `activeTenant` remains tenant/super-admin context only. It MUST NOT be reused as the product-line switcher. The header MUST stop labeling tenant context as "Workspace"; tenant context should be labeled as tenant/facility context, while Product Line selection is represented by a separate `activeWorkspace`.
- **FR-A2:** `ProductLine` TypeScript type defined as alias/extension of existing `Workspace` type. Exported from `@/types/product-line` and re-exported where convenient.
- **FR-A3:** A dedicated `facility` workspace (slug = `'facility'`) exists for hosting `scope='global'` agents. Seeded on migration using the live `workspaces.name` column; idempotent.
- **FR-A4:** `projects.github_repo` is nullable and not uniqueness-constrained across workspace (already true post-migration 028). Non-code departments (Marketing, Customer Service, Finance) may set `github_repo = NULL` and skip GitHub sync participation.

### B. Agent scope (D3, D4a)

- **FR-B1:** `agents.scope TEXT NOT NULL DEFAULT 'workspace' CHECK (scope IN ('workspace','global'))` added via additive migration.
- **FR-B2:** Backfill migration: `UPDATE agents SET scope='global' WHERE LOWER(name) IN ('aegis','security-guardian','hal')`.
- **FR-B3:** Agent-visibility query replaces single-workspace lookup with `WHERE scope='global' OR workspace_id = :current` across all affected endpoints.
- **FR-B4:** `task-dispatch.ts` Aegis resolution: `aegisAgentByWorkspace` replaced by a single global Aegis lookup; fallback to per-workspace only if a workspace has an explicit legacy local Aegis record.
- **FR-B5:** Cross-product agent sharing is NOT supported by default (D4a strict-twin). A `scope='global'` promotion is the only path to cross-product visibility.

### C. UI — product-line switcher (D1, D4b)

- **FR-C1:** New component `<WorkspaceSwitcher>` in `header-bar.tsx`. Renders a dropdown listing all workspaces the current user has access to, plus a "Facility" (null) entry. This is separate from `activeTenant`.
- **FR-C2:** Zustand store gains `activeWorkspace: Workspace | null` with persistence across sessions.
- **FR-C2a:** REST request model: filtered endpoints accept an optional requested `workspace_id`/product-line scope, authorize it with tenant/workspace access checks, and then query that workspace. Omitted scope means existing authenticated-workspace behavior unless the endpoint is explicitly documented as facility aggregate.
- **FR-C2b:** SSE request model: `/api/events` supports authorized product-line filtering for `activeWorkspace` and authorized tenant/facility aggregation for null `activeWorkspace`, consistent with D4b. Events must never leak workspaces outside the authenticated user's tenant/access set.
- **FR-C3:** **Filtered panels** (pass the authorized requested workspace scope when `activeWorkspace` is set):
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

- **FR-D1:** The live SQL table is `workflow_templates`. A "task-chain template" is a domain alias over `workflow_templates`, not a separate `task_templates` table.
- **FR-D1a:** `workflow_templates` gains task-chain columns: `slug TEXT NULL`, `output_schema JSON`, `routing_rules JSON`, `next_template_slug TEXT NULL`, `produces_pr BOOLEAN NOT NULL DEFAULT 0`, and `external_terminal_event TEXT NULL`. `slug` is required for declarative routing once `FEATURE_TASK_PIPELINES` is enabled; it should be unique per workspace when non-null.
- **FR-D1b:** `tasks` gains binding/lineage fields before Phase 3 ships: `workflow_template_id INTEGER REFERENCES workflow_templates(id)`, `workflow_template_slug TEXT NULL` for snapshot/readability, `parent_task_id INTEGER REFERENCES tasks(id)`, `root_task_id INTEGER REFERENCES tasks(id)`, `chain_id TEXT NULL`, and `chain_stage INTEGER NULL`. `workflow_template_id` is the canonical binding; slug is a denormalized template identity snapshot used for routing/debugging.
- **FR-D2:** Agent output validated against `output_schema` using an explicit direct `ajv` dependency at task-completion time. Invalid output → task → `failed`, chain does not advance. Logged to `activities`.
- **FR-D3:** Routing resolution order on successful completion:
  1. Evaluate `routing_rules` in order; first match wins → create successor task from resolved workflow-template slug.
  2. Else if `next_template_slug` set → create successor task from that slug.
  3. Else chain terminates; task remains in terminal success state.
- **FR-D4:** Successor tasks inherit `workspace_id` and `project_id` from the parent task. Assignee is resolved by the SQL join `SELECT a.name FROM project_agent_assignments paa JOIN agents a ON a.name = paa.agent_name WHERE paa.project_id = :project_id AND paa.role = :workflow_templates.agent_role LIMIT 1`. The live `project_agent_assignments` table (added at `src/lib/migrations.ts:825-836`) keys agents by `agent_name TEXT NOT NULL` (NOT `agent_id`); the `role` column has `DEFAULT 'member'` and the table has `UNIQUE(project_id, agent_name)`.
- **FR-D4a:** Successor creation MUST go through a single shared `createTask()` helper at `src/lib/task-create.ts`. The helper performs INSERT, ticket-counter allocation, activity logging, creator subscription, mention/assignee notifications, GitHub push (when `projects.github_sync_enabled=1` AND `projects.github_repo IS NOT NULL`), and GNAP push (when configured). The four current direct `INSERT INTO tasks` callsites (`src/app/api/tasks/route.ts:218`, `src/app/api/github/route.ts:159`, `src/lib/github-sync-engine.ts:189`, `src/lib/recurring-tasks.ts:105`) are migrated to use this helper as a Phase 3 prerequisite. CI greps for `INSERT INTO tasks` outside `src/lib/task-create.ts` and fails on match.
- **FR-D5:** Phase 3 reads structured parent output from `tasks.resolution` as the temporary bridge before Phase 6 artifact publishing exists. After Phase 6, canonical handoff state moves to `task_artifacts`; `tasks.resolution` remains a fallback/summary source for backward compatibility.
- **FR-D6:** Workflow templates created by operator (seed scripts + UI editor in `settings-panel.tsx`). Agents MUST NOT create or modify templates. Governance: template write endpoints require operator auth.
- **FR-D7:** Tasks without workflow-template binding or with all chain fields NULL behave as today — single-step, no chain, zero regression.
- **FR-D8:** Routing-rule expression language: safe-subset boolean expressions over the output JSON. Implementation MUST use `jsonpath-plus` (with `eval: 'safe'` / `preventEval: true`) for the JSONPath traversal and a hand-written recursive-descent parser for the boolean grammar. Forbidden: any use of the `eval` global, `Function` constructor, `vm`, `vm2`, `with`, dynamic `require`, prototype-chain access (`__proto__`, `constructor`), arithmetic and bitwise operators on the right-hand side, regex on the right-hand side, and any operator outside the explicit allowlist (`==`, `!=`, `in`, `not in`, `&&`, `||`, `!`).
- **FR-D9:** Phase 6 upgrades parent-stage handoff reads to `task_artifacts`; until then, Phase 3 must not depend on artifact publishing being implemented.
- **FR-D10:** Mission Control supports a constrained JSON Schema profile for `output_schema` with the following NUMERIC bounds (autopilot must implement these literally, not paraphrase): `maxOutputBytes=262144` (256 KiB), `maxSchemaBytes=65536` (64 KiB), `maxNestingDepth=16`, `maxKeysPerObject=256`, `maxArrayLength=1024`, `maxStringLength=32768` (32 KiB), `maxPatternLength=256`, `maxValidationMs=50`. Forbidden schema features: remote `$ref` (only `#/...` local refs), `$dynamicRef`, `$dynamicAnchor`, custom keywords, async schemas, the `format` validator (annotations allowed, enforcement forbidden), and any `pattern` rejected by `safe-regex`. Compiled validators are cached per `(template_id, schema_sha256)` with LRU eviction at 256 entries.
- **FR-D11:** Dependency policy: `ajv` AND `jsonpath-plus` MUST be explicit pinned direct dependencies in `package.json` and `pnpm-lock.yaml`, reviewed as supply-chain surface, covered by CI, and never imported as transitive dependencies.

### E. Task state extension (D6)

- **FR-E1:** Task-status vocabulary gains `ready_for_owner`. The live schema (verified 2026-04-24) shows `tasks.status TEXT NOT NULL DEFAULT 'inbox'` with NO database CHECK constraint (the comment listing valid values at `src/lib/schema.sql:9` is documentation only, not an enforced constraint). Therefore enforcement is **application-level only** for v1: extend the TypeScript status union, the Zod schema, `STATUS_LABEL_MAP` in `src/lib/github-label-map.ts`, `ALL_STATUS_LABEL_NAMES`, and the kanban column ordering. NO DB-level CHECK is added. A future spec may add a CHECK constraint after a backfill audit; that is out of scope for v1.
- **FR-E2:** `github-label-map.ts` — `STATUS_LABEL_MAP.ready_for_owner = 'mc:ready-for-owner'`; `ALL_STATUS_LABEL_NAMES` updated; `initializeLabels` auto-creates the GitHub label on sync.
- **FR-E3:** Kanban panel (`task-board-panel.tsx`) renders `ready_for_owner` as a distinct column between `quality_review` and `done`.
- **FR-E4:** Distinct notification class for `ready_for_owner` transitions (operator action required).

### F. Two-step terminal event (D7)

- **FR-F1:** `workflow_templates` gains `produces_pr BOOLEAN NOT NULL DEFAULT 0` and `external_terminal_event TEXT NULL`.
- **FR-F2:** Scheduler `runAegisReviews` branches on successful Aegis approval:
  - `template.produces_pr = true` → transition to `ready_for_owner` (NOT `done`).
  - Else → transition to `done` (current behavior).
- **FR-F3:** `github-sync-engine.ts` `pullFromGitHub` on linked PR merge: if a `produces_pr=true` task is in `ready_for_owner`, transition to `done`.
- **FR-F4:** A linked GitHub issue closing without a merged linked PR MUST NOT transition a `produces_pr=true` task to `done`; leave it in `ready_for_owner` and create an operator-visible reconciliation activity/alert.
- **FR-F5:** Non-PR-producing templates (triage, plan, review, close_issue) are unaffected — direct `quality_review → done` on Aegis approval. Issues that do not or will not have PRs remain supported by `produces_pr=false` templates and close/disposition workflow paths.

### G. GitHub sync — monorepo + area labels (D8)

- **FR-G1:** `github-label-map.ts` gains `AREA_LABEL_MAP = { qa, dev, devsecops, marketing, customer_service, finance, ... }`. `ALL_AREA_LABEL_NAMES` exported. Extensible per product line. Product surfaces/components such as macOS App, Website, UI, Documentation, integrations, licensing/billing, and onboarding use labels or structured task metadata (for example `surface:macos-app`, `surface:website`, `component:ui`) rather than project rows.
- **FR-G2:** `initializeLabels` on sync enablement creates the `area:*` label family in the target repo.
- **FR-G2a:** Shared-repo sync uses one repo-level sync owner per `(workspace_id, github_repo)` or an equivalent dedupe key. Multiple department projects sharing a monorepo MUST NOT each poll and ingest the same issue independently. Existing uniqueness on `(workspace_id, github_repo, github_issue_number)` remains a last-line guard, not the primary dedupe strategy.
- **FR-G3:** `pullFromGitHub` on issue ingestion:
  1. Read `area:*` label(s) from the issue.
  2. If exactly one resolvable `area:*` label exists, resolve `(workspace_id, area_slug)` → target `project_id` and set `task.project_id = resolved`.
  3. If no `area:*` label, more than one `area:*` label, or resolution fails, route to the workspace's triage/inbox project with `area:triage` tag and create an activity explaining the ambiguity.
- **FR-G4:** `pushTaskToGitHub` on task creation/update: emit `area:<project_slug>` label alongside existing `mc:*` and `priority:*` labels.
- **FR-G5:** Multiple projects within one workspace may share a `github_repo`. Sync ownership/dedupe, not per-project duplicate polling, protects ingestion.

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

### I. Shared task artifact store (D11)

- **FR-I1:** Agent sandboxes are private execution spaces. Mission Control owns the shared, durable handoff plane. Agents publish required outputs into MC artifact storage; successor agents consume artifact references through MC.
- **FR-I2:** New append-only `task_artifacts` table stores metadata and inline content for JSON/Markdown artifacts and references for file-backed artifacts.
- **FR-I3:** Supported storage modes: `inline_json`, `inline_markdown`, `file`, `external_uri`.
- **FR-I4:** File-backed artifacts support PDFs, images, CSVs, Excel files, logs, screenshots, archives, and future media types subject to MIME allowlist, size limits, hashing, and security checks.
- **FR-I5:** Artifact writes record `workspace_id`, `project_id`, `task_id`, producer agent, template slug, artifact type, schema version, storage URI, filename, MIME type, byte size, SHA-256, preview text, redaction status, security scan status, and supersession relation.
- **FR-I6:** Artifacts MUST NOT persist secrets. The single redaction/rejection gate is `src/lib/secret-detector.ts`, exporting `detectSecrets(content, mime)` returning `{ findings, redacted }`. Default ruleset is **MC Secret Detector v1**, derived from gitleaks 8.x default rules plus Mission Control additions. Required rule families: AWS access key id, AWS secret access key, GitHub PAT (`gh[pousr]_…`), GitHub fine-grained PAT, GitHub OAuth (`gho_…`), Google API key (`AIza…`), Slack token, Stripe live keys, generic PEM private-key blocks (`BEGIN PRIVATE KEY`, `BEGIN RSA PRIVATE KEY`, `BEGIN OPENSSH PRIVATE KEY`), `.env`-style assignments for `password=`, `api_key=`, `token=`, `secret=`, JWT (3-segment dot-separated base64url), generic `Authorization: Bearer …` headers, and Anthropic / OpenAI key patterns (`sk-ant-…`, `sk-…`). Default policy: **REJECT** the publish on any finding. Templates may opt into `allow_redacted_artifacts=1` to instead store the redacted content. Every finding produces an `activities` row of kind `security_violation` with the matched rule id (NOT the matched substring).
- **FR-I7:** Downstream agents receive safe previews plus artifact references by default. Raw file content is fetched only through MC-controlled artifact-read paths.
- **FR-I8:** Aegis, Security Guardian, audit views, and operator UI can inspect artifact provenance, hashes, scan status, and relevant content previews.
- **FR-I9:** Artifact store observability includes artifact count, total bytes, bytes by product line/project/task, failed publishes, failed scans, failed reads, orphan count, p95 publish/read latency, and storage free-space thresholds.
- **FR-I10:** Admin maintenance supports list/search, metadata inspection, quarantine, delete/archive by policy, orphan repair, hash verification, preview/index rebuild, retention policy enforcement, and audit logs for read/write/delete/quarantine.

### J. Resource governance (D12)

- **FR-J1:** Reuse existing token/cost telemetry (`/cost-tracker`, `/api/tokens`, task-cost reports, provider-subscription detection) as the measurement layer. Do not duplicate token ingestion unless a missing event source is identified.
- **FR-J1a:** Ingest HAL OpenClaw health telemetry from `~/.openclaw/health/readings.jsonl`, `current-rate.json`, and `cost.json` into Mission Control's cost surface as electricity / infrastructure usage records. Preserve backward compatibility of `/api/tokens` by adding additive response fields or actions rather than breaking existing consumers.
- **FR-J1b:** OpenClaw health electricity / infra support is `fork-only optional` in v1. It must be controlled by a dedicated flag such as `FEATURE_OPENCLAW_HEALTH_COSTS` and an explicit config path. If the flag is OFF or the files/config are absent, Mission Control behaves exactly as it does today.
- **FR-J1c:** v1 OpenClaw health electricity / infra support requires **no schema migration**. It is implemented as a runtime adapter, not a persistent core-table dependency.
- **FR-J2:** Add `resource_policies` and `resource_policy_events` tables. Policies are scoped by any combination of workspace/product line, project/department, task status, template slug, agent role, agent, provider, model, and period/window.
- **FR-J3:** Support policy types `wip_limit`, `budget`, `blackout`, and `degraded_window`.
- **FR-J4:** Budget policies support `estimated_marginal_cost_usd`, raw token counts, requests, sessions, dispatches, active tasks, in-progress tasks, provider usage, model usage, and task-chain cost. OpenAI ChatGPT Pro or other provider subscription flags may reduce estimated marginal USD to zero, but raw usage budgets still apply.
- **FR-J4a:** Budget policies also support `electricity_cost_usd`, `infra_cost_usd`, `energy_kwh`, `power_watts`, and `blended_total_cost_usd` (`token/API + electricity/infra`) at least at facility scope in v1.
- **FR-J5:** Scheduler enforcement runs before `autoRouteInboxTasks`, `dispatchAssignedTasks`, `advanceTaskChain`, and `runAegisReviews`. A governance decision returns `allow`, `defer`, `block`, or `override_required`.
- **FR-J6:** Soft thresholds create activity/alert records without stopping work. Hard thresholds pause/defer/block new work according to the policy's `enforcement`; in-flight tasks may finish or checkpoint unless an explicit emergency halt policy says otherwise.
- **FR-J7:** Replace hard-coded capacity rules (`LIMIT 3`, "3+ in-progress tasks") with policy-backed defaults that preserve existing behavior when `FEATURE_RESOURCE_GOVERNANCE` is OFF.
- **FR-J8:** Cost Tracker UI gains a governance view or tab showing budget utilization, token/request usage, WIP by state/agent/project, active blackout/degraded windows, upcoming windows, policy decisions, and operator overrides.
- **FR-J8a:** Cost Tracker overview also shows facility electricity rate, recent power draw / energy usage when available, cumulative electricity spend, and blended totals. If attribution to task/agent/project is not reliable, electricity appears as facility-level overhead rather than fake per-task precision.
- **FR-J9:** Every non-allow governance decision is written to `resource_policy_events`, shown in audit/activity surfaces, and includes enough metadata to explain why work was deferred, blocked, or override-gated.
- **FR-J10:** Real-time rate windows from OpenClaw health telemetry may drive degraded/blackout policy for high-draw local workloads. Governance must allow operator-defined policy on whether electricity price spikes pause only local-model work or all autonomous work.
- **FR-J11:** If OpenClaw health telemetry is unavailable, unreadable, or malformed, Mission Control must degrade gracefully: no scheduler crash, no API contract breakage, and no false governance block based on missing infra data.

### K. FocusEngine pilot (pilot)

- **FR-K1:** Seed the `facility` workspace + FocusEngine workspace + per-department projects (QA, Development, DevSecOps, Marketing, Customer Service, Finance). Do not create `macos`, `ui`, `website`, or `docs` projects; represent those as task labels/metadata under the appropriate department.
- **FR-K2:** Seed the FocusEngine workflow family: `focusengine_issue_triage`, `focusengine_remediation_plan`, `focusengine_specialist_route`, `focusengine_owner_review`, `focusengine_close_issue`, `focusengine_dev_implementation`, `focusengine_review`, `focusengine_aegis` (Aegis is invoked by scheduler, not a template, but the flow is documented).
- **FR-K3:** Map agent roles to `project_agent_assignments`:
  - `researcher` → `focusengine-macos-research`
  - `planner` → `focusengine-macos-planner`
  - `dev` → `focusengine-macos-dev`
  - `ui` → `focusengine-macos-ui`
  - `devsecops` → `focusengine-macos-devsecops`
  - `qa` → `focusengine-macos-qa`
- **FR-K4:** Point FocusEngine workspace's GitHub repo at `fgabelmannjr/focusengine` (or `racecraft-lab/focusengine`, whichever is canonical at rollout).
- **FR-K5:** Trigger pilot with FocusEngine issue #110 (canonical pilot trigger). The historical smoke plan lives in the operator's Obsidian vault (informational reference; not required for autopilot ingestion). The seed script falls back to a synthetic issue titled `[mc-pilot] synthetic e2e issue` if #110 is unavailable; second smoke on #111 or a second synthetic.
- **FR-K6:** Treat existing synced FocusEngine GitHub issue tasks as unprocessed intake. Preserve GitHub linkage and sync metadata, move them into FocusEngine triage/intake, and start the new departmental workflow from triage.

## 6) Data Model Changes (Additive Migrations)

### Migration sequence (no destructive changes)

```sql
-- M53: agent_scope
ALTER TABLE agents ADD COLUMN scope TEXT NOT NULL DEFAULT 'workspace'
  CHECK (scope IN ('workspace','global'));
UPDATE agents SET scope='global' WHERE LOWER(name) IN ('aegis','security-guardian','hal');

-- M54: agent_sandbox_terminology
-- No DB rename unless live schema proves agents.workspace_path exists.
-- Rename user-facing and config-level "agent workspace" terminology to "Sandbox".
-- If a DB column does exist in the live schema, add a separate compatibility migration
-- rather than assuming ALTER TABLE agents RENAME COLUMN is safe.

-- M55: task_status_ready_for_owner
-- Add ready_for_owner to the application status vocabulary.
-- Only rebuild a SQLite CHECK constraint if full live ".schema tasks" proves one exists.

-- M56: workflow_templates_task_chain_routing
ALTER TABLE workflow_templates ADD COLUMN slug TEXT NULL;
ALTER TABLE workflow_templates ADD COLUMN output_schema JSON;
ALTER TABLE workflow_templates ADD COLUMN routing_rules JSON;
ALTER TABLE workflow_templates ADD COLUMN next_template_slug TEXT NULL;
ALTER TABLE workflow_templates ADD COLUMN produces_pr BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE workflow_templates ADD COLUMN external_terminal_event TEXT NULL;
-- Add a unique index for non-null slugs per workspace if SQLite version/support permits:
-- CREATE UNIQUE INDEX idx_workflow_templates_workspace_slug
--   ON workflow_templates(workspace_id, slug)
--   WHERE slug IS NOT NULL;

-- M56a: tasks_workflow_template_binding_and_lineage
ALTER TABLE tasks ADD COLUMN workflow_template_id INTEGER REFERENCES workflow_templates(id);
ALTER TABLE tasks ADD COLUMN workflow_template_slug TEXT NULL;
ALTER TABLE tasks ADD COLUMN parent_task_id INTEGER REFERENCES tasks(id);
ALTER TABLE tasks ADD COLUMN root_task_id INTEGER REFERENCES tasks(id);
ALTER TABLE tasks ADD COLUMN chain_id TEXT NULL;
ALTER TABLE tasks ADD COLUMN chain_stage INTEGER NULL;
CREATE INDEX idx_tasks_workflow_template_id ON tasks(workflow_template_id);
CREATE INDEX idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX idx_tasks_chain_id ON tasks(chain_id);

-- M56b: workspace_feature_flags
ALTER TABLE workspaces ADD COLUMN feature_flags JSON;
-- NULL means all feature flags resolve to hardcoded OFF defaults unless overridden elsewhere.

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

-- M58: task_artifacts
CREATE TABLE task_artifacts (
  id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
  project_id INTEGER REFERENCES projects(id),
  producer_agent_id INTEGER REFERENCES agents(id),
  workflow_template_slug TEXT,
  artifact_type TEXT NOT NULL,
  schema_version TEXT,
  storage_kind TEXT NOT NULL CHECK (storage_kind IN ('inline_json','inline_markdown','file','external_uri')),
  content_json JSON,
  content_markdown TEXT,
  storage_uri TEXT,
  original_filename TEXT,
  mime_type TEXT,
  byte_size INTEGER,
  sha256 TEXT,
  preview_text TEXT,
  redaction_status TEXT NOT NULL DEFAULT 'pending',
  security_scan_status TEXT NOT NULL DEFAULT 'pending',
  supersedes_artifact_id INTEGER REFERENCES task_artifacts(id),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_task_artifacts_task_created_at
  ON task_artifacts(task_id, created_at);
CREATE INDEX idx_task_artifacts_workspace_type
  ON task_artifacts(workspace_id, artifact_type);

-- M59: facility_workspace_seed
INSERT OR IGNORE INTO workspaces (slug, name, tenant_id)
  VALUES ('facility', 'Facility', 1);

-- M60: resource_policies
CREATE TABLE resource_policies (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER REFERENCES workspaces(id),
  project_id INTEGER REFERENCES projects(id),
  agent_id INTEGER REFERENCES agents(id),
  agent_role TEXT,
  task_status TEXT,
  workflow_template_slug TEXT,
  provider TEXT,
  model TEXT,
  policy_type TEXT NOT NULL CHECK (policy_type IN ('wip_limit','budget','blackout','degraded_window')),
  limit_kind TEXT NOT NULL,
  limit_value REAL,
  period TEXT,
  timezone TEXT,
  schedule_json JSON,
  enforcement TEXT NOT NULL CHECK (enforcement IN ('alert','defer','pause_new_work','block_dispatch','require_override')),
  soft_threshold_pct REAL DEFAULT 80,
  hard_threshold_pct REAL DEFAULT 100,
  enabled BOOLEAN NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_resource_policies_scope
  ON resource_policies(workspace_id, project_id, agent_id, policy_type, enabled);

-- M61: resource_policy_events
CREATE TABLE resource_policy_events (
  id INTEGER PRIMARY KEY,
  policy_id INTEGER REFERENCES resource_policies(id),
  task_id INTEGER REFERENCES tasks(id),
  agent_id INTEGER REFERENCES agents(id),
  decision TEXT NOT NULL CHECK (decision IN ('allow','defer','block','override_required','override')),
  reason TEXT,
  observed_value REAL,
  limit_value REAL,
  metadata JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_resource_policy_events_created_at
  ON resource_policy_events(created_at);
CREATE INDEX idx_resource_policy_events_task
  ON resource_policy_events(task_id, created_at);

-- No migration in v1 for OpenClaw health electricity / infra costs.
-- That integration remains a fork-only optional runtime adapter.
```

## 7) Non-Functional Requirements

- **NFR-1 Zero regression:** existing deployments pre-migration state is reachable post-migration (null `activeWorkspace`, null `next_template_slug`, non-`global` agent scopes). Every new behavior is additive or feature-flag-guarded.
- **NFR-2 Upstream compat:** `workspaces` table not renamed. `workspace_id` columns not renamed. Cherry-picks from `builderz-labs/main` remain viable.
- **NFR-3 Single-agent primacy:** each task still has one `assigned_to`, one status, one kanban card. The pipeline is a relationship between tasks, not a state of a task.
- **NFR-4 Governance:** agents cannot create, modify, or choose successor templates. Template write endpoints require operator auth. Invalid structured output breaks the chain deterministically.
- **NFR-5 Observability:** every triage disposition logged. Every state transition auditable via existing `activities`, `task_dispositions`, and `task_artifacts`.
- **NFR-6 Performance:** routing-rule evaluation and schema validation MUST NOT increase task-completion latency by more than 50ms at p95 (one-shot per completion).
- **NFR-7 Rollback-safe:** each migration is individually revertible **via documented manual reverse SQL** (one `docs/migrations/rollback-M<id>.sql` file per migration, plus `docs/migrations/rollback-procedure.md`); the live migration runner is forward-only and rollback is operator-initiated. Feature flags (resolved via the Feature Flag Resolution Policy in the technical roadmap) allow shipping code without activating new behavior.
- **NFR-8 Artifact store safety:** artifact publish/read/delete/quarantine operations are audited; retention, quotas, scan status, and storage health are operator-visible.
- **NFR-9 Dependency safety:** new runtime dependencies are pinned, direct, reviewed, and validated by dependency audit/lockfile checks in CI.
- **NFR-10 Resource governance safety:** when enabled, a thrown error inside `evaluateResourceGovernance` causes the call site to return `defer` (NOT `block`, to avoid wedging dispatch on a transient bug); the error is recorded in `resource_policy_events` and `activities` and an operator notification fires. A scheduler-wide circuit breaker (>5 errors/minute) opens and bypasses the evaluator (returns `allow`) until manually reset, with operator alert. This combination prevents both silent failure and full DOS while keeping WIP / blackout / hard-budget policy meaningful when the evaluator is healthy.
- **NFR-11 Compatibility labeling:** every major feature and every roadmap phase must declare `upstream-safe`, `upstream-divergent`, or `fork-only optional`.
- **NFR-12 Adapter absence safety:** fork-only adapters such as OpenClaw health electricity/infra ingestion must no-op cleanly when their files/config are absent.
- **NFR-13 Successor side-effect parity:** task-chain successor creation MUST go through the shared `createTask()` helper at `src/lib/task-create.ts` (extracted as a Phase 3 prerequisite). Parity is enforced structurally — by sharing the function — not by attempting to keep two parallel code paths in sync. CI greps for `INSERT INTO tasks` outside `src/lib/task-create.ts` and fails on match.
- **NFR-14 Schema truthfulness:** docs, migrations, and smoke checks must not assert nonexistent tables, columns, or DB constraints. `workflow_templates` (with existing columns: `name`, `description`, `model`, `task_prompt`, `timeout_seconds`, `agent_role`, `tags`, `created_by`, `created_at`, `updated_at`, `last_used_at`, `use_count`, plus `workspace_id` added by a later migration), `workspaces.name`, `quality_reviews.reviewer` (TEXT), `project_agent_assignments.agent_name` (TEXT, NOT `agent_id`), `agents.workspace_path` (EXISTS), and application-level (NOT DB CHECK) status validation on `tasks.status` are the documented live-schema defaults. Any roadmap deliverable that contradicts these MUST first verify and document the live schema.
- **NFR-15 Secret detector ruleset versioning:** the secret detector at `src/lib/secret-detector.ts` declares a versioned ruleset (`MC Secret Detector v1`, derived from gitleaks 8.x default rules plus MC additions). Every rule has positive AND negative fixtures in `src/lib/__tests__/fixtures/secrets/`. CI enforces ≥1 fixture per rule and runs `safe-regex` against every rule pattern. Ruleset upgrades go through a separate spec.
- **NFR-16 Routing evaluator hygiene:** the routing-rule evaluator MUST use `jsonpath-plus` with `eval: 'safe'` / `preventEval: true` for path traversal and a hand-written recursive-descent parser for the boolean grammar. Use of `eval`, `Function`, `vm`, `vm2`, `with`, dynamic `require`, prototype-chain access, arithmetic on right-hand side, or any non-allowlisted operator is forbidden and CI-greppable.

## 8) Constraints (from Hub)

1. Zero regressions for existing users.
2. Preserve single-agent as the primary working mode.
3. Departmental / staged-handoff behavior opt-in, feature-flagged, or null-default.
4. Aegis is a global facility-wide singleton (D3 formalizes this).
5. Preserve `builderz/main` upstream compatibility (D2 enforces this).
6. HAL/OpenClaw-only integrations must remain optional, disabled by default, and absent-safe.

## 9) Risks & Mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | Aegis refactor (per-workspace → global) touches ~60+ references across `tasks/route.ts`, `scheduler.ts`, `validation.ts`, `task-dispatch.ts`, `task-board-panel.tsx`, chat components | Dedicated refactor phase (Phase 2) with comprehensive test coverage before any other multi-workspace behavior ships. Maintain a shim for legacy workspace-Aegis records. |
| R2 | Cross-product MEMORY.md context bleed if `scope='global'` is over-applied | D4a strict-twin is the default. Global promotion is per-agent, explicit, reviewed. |
| R3 | Routing-rule expression safety — arbitrary eval in rule evaluation | FR-D8 mandates safe-subset expression language (JSONPath + comparisons), no runtime eval. |
| R4 | Template schema validation false-positives or schema abuse | Use explicit pinned `ajv`; constrain the supported schema profile; cache compiled validators; maintain schema version fields; tests cover malicious schemas, invalid output, performance, and agent prompt/schema drift. |
| R5 | GitHub area-label drift (labels deleted in repo, or operator renames) | `initializeLabels` runs on sync enable and is idempotent; label absence triggers `area:triage` fallback (FR-G3). |
| R6 | `activeWorkspace` state desync between browser tabs | The live store (`src/store/index.ts:4`) imports only `subscribeWithSelector` — there is **no existing `persist` middleware** and **no `BroadcastChannel` cross-tab listener**. Phase 1 implements both from scratch for the `activeWorkspace` slice only: `zustand/middleware`'s `persist` (key `mc:active-workspace:v1`, `localStorage`) plus a `BroadcastChannel('mc:active-workspace')` listener with a graceful no-op fallback when the API is unavailable. |
| R7 | Disposition logging table grows unboundedly | Acceptable at current scale; revisit partitioning at 1M+ rows. Index on `(workspace_id, triaged_at)` supports range queries. |
| R8 | Feature-flag sprawl — too many flags, unclear defaults | All new flags default to OFF; flipping ON is a manual operator decision per product line. |
| R9 | ChatGPT Pro / subscribed-provider cost reads as `$0`, hiding runaway usage | D12 separates estimated marginal USD from token/request/session/WIP budgets. Raw usage budgets still enforce even when dollar cost is zero. |
| R10 | "Additive" schema changes are mistaken for upstream-safe changes | D13 forces explicit compatibility labeling; roadmap must mark schema/state divergence as fork pressure before implementation. |
| R11 | OpenClaw health electricity integration leaks HAL assumptions into upstream installs | Keep it fork-only optional, runtime-adapter-based, absent-safe, and behind its own flag with no schema migration in v1. |

## 10) Open Questions (deferred)

- **D4c — Chat history isolation** (default: product-line-scoped for non-global agents, cross-product for globals; formalize during implementation).
- **D4d — Skills library isolation** (default: facility-wide skills with per-product-line opt-out).
- **D4e — User ACLs per product line** (v2, not in this PRD).

## 11) Phased Rollout

Detailed phasing in `docs/ai/rc-factory-technical-roadmap.md`. Summary:

| Phase | Scope | Ship-safe? | Compatibility class |
|---|---|---|---|
| 0 | Foundation migrations (M53–M61) | Yes — runtime-safe | `upstream-divergent` |
| 1 | Workspace switcher + `activeWorkspace` scoping | Yes — flag-off default | `upstream-safe` |
| 2 | Aegis refactor (facility singleton) | Yes — shim preserves legacy | `upstream-divergent` |
| 3 | Task-chain engine + declarative routing over `workflow_templates` | Yes — null-default fields | `upstream-divergent` |
| 4 | `ready_for_owner` state + two-step terminal | Yes — per-template opt-in | `upstream-divergent` |
| 5 | Area labels + GitHub sync updates | Yes — fallback to `area:triage` | `upstream-safe` |
| 6 | Disposition logging + artifact store + audit/admin panels | Yes — purely additive | `upstream-divergent` |
| 7 | Resource governance + Cost Tracker enforcement | Yes — flag-off default | Mixed: governance core = `upstream-divergent`; OpenClaw health cost adapter = `fork-only optional` |
| 8 | FocusEngine pilot (issue #110, then #111) | Gated behind pilot feature flag | Fork rollout only |
| 9 | Second product line onboarding (Racecraft Lab) | Post-pilot | Fork rollout only |

### Autopilot Caveats (per spec)

- **SPEC-001 (Phase 0)** is migration-only and intentionally degenerate for the SDD funnel. `clarify`, `checklist`, and `analyze` should produce minimal output (no markers, "N/A — pure-schema spec" gaps, migration-safety findings only). The implement phase consists of the migration writes and the per-migration smoke checks listed in P0-AC1..AC14. Rollback for SPEC-001 is documented manual reverse SQL (the live migration runner has no `down()` function).
- **SPEC-009 (Phase 8)** has one intentional human-in-the-loop checkpoint: `G_PILOT_MERGE`. Autopilot stops after observing `ready_for_owner` and resumes when `pullFromGitHub` records the linked PR merge. ACs P8-AC1, P8-AC6, P8-AC7 are MANUAL and live in `docs/qa/pilot-smoke-checklist.md`; they are NOT validated by `gate-validator`.
- **SPEC-010 (Phase 9)** AC P9-AC1 (1-operator-hour onboarding) is MANUAL; the operator records timestamps in the pilot smoke checklist. Code-checkable ACs P9-AC2..AC4 are validated by `gate-validator` and `implement-executor` TDD as usual.
- **Tool count = N/A:** every spec in this PRD is non-tool-surface. `/speckit-pro:setup` should accept `N/A` and skip MCP-tool artifacts.

## 12) Success Measurement

- Every single-workspace deployment passes the existing test suite post-migration: **PASS gate**.
- FocusEngine issue #110 completes end-to-end through the pipeline with no operator intervention beyond PR merge (the `G_PILOT_MERGE` human gate): **PILOT gate**.
- Disposition dashboard and artifact admin health panels show 7-day rollups / storage health for at least one product line: **TELEMETRY gate**.
- Second product line onboarding completes in < 1 operator-hour: **SCALE gate** (manual measurement).
