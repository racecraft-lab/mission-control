# Mission Control Departmental Architecture — Technical Roadmap

> For SpecKit-Pro ingestion. Companion to the PRD at `docs/rc-factory-v1-prd.md`. Every phase is ship-safe on its own (additive migrations + feature flags), but ship-safe does **not** necessarily mean upstream-safe. Each phase below is explicitly labeled for upstream impact so fork pressure is visible before implementation.

## Guiding Principles

1. **Additive or compatibility-preserving migrations only.** No destructive schema changes. Do not assume column renames or CHECK rebuilds are safe unless the live schema proves the column/constraint exists and rollback compatibility is documented.
2. **Feature flags for every new runtime behavior.** All flags default OFF. Flipping ON is an explicit operator action per product line, stored in the documented feature-flag storage mechanism.
3. **Ship each phase to production** behind its flag before enabling. Deploy code ≠ activate behavior.
4. **Dev-first, flag-scoped canary on live.** Write and commit changes in `~/mission-control` (dev worktree, `codex/openclaw-nodes-fallback`). Promote via PR merge to `main` → `git fetch` + `pnpm build` + restart `next-server` in `~/mission-control-sync` (the live worktree). The "canary" is a feature flag flipped for ONE workspace (e.g., the facility workspace or a dedicated test workspace) on the live service, validated, then promoted to wider workspaces. There is no separate canary environment on the OpenClaw node; there is ONE live MC and flag-scoping provides the safety.
5. **Upstream compat gate** on every PR: cherry-pick candidates from `builderz-labs/main` should still apply cleanly.
6. **Prefer upstream-safe extensions over schema divergence.** If the same goal can be achieved with an additive adapter, config path, or feature-flagged runtime hook, choose that before adding schema.
7. **OpenClaw-specific features are fork-only adapters.** They must be disabled by default and no-op cleanly when absent.

## Upstream Impact Rubric

| Label | Meaning |
|---|---|
| `upstream-safe` | additive, opt-in, and realistic to upstream |
| `upstream-divergent` | runtime-safe for current installs, but introduces schema/state/API divergence that increases permanent-fork pressure unless upstream accepts it |
| `fork-only optional` | OpenClaw/local-environment-specific adapter that must remain absent-safe and disabled by default |

## Phase Map (At a Glance)

| Phase | Title | Ship-safe? | Feature Flag | Upstream impact | Blocks |
|---|---|---|---|---|---|
| 0 | Foundation migrations (M53–M61) | Yes | None — pure schema | `upstream-divergent` | — |
| 1 | Product-line switcher + `activeWorkspace` | Yes | `FEATURE_WORKSPACE_SWITCHER` | `upstream-safe` | Phase 8 |
| 2 | Aegis refactor (facility singleton) | Yes (shim) | `FEATURE_GLOBAL_AEGIS` | `upstream-divergent` | Phase 3, 8 |
| 3 | Task pipeline engine + routing | Yes | `FEATURE_TASK_PIPELINES` | `upstream-divergent` | Phase 4, 6, 8 |
| 4 | `ready_for_owner` state + two-step terminal | Yes | `FEATURE_TWO_STEP_TERMINAL` | `upstream-divergent` | Phase 8 |
| 5 | Area-label GitHub sync | Yes | `FEATURE_AREA_LABEL_ROUTING` | `upstream-safe` | Phase 8 |
| 6 | Disposition logging + artifact store + audit/admin panels | Yes | `FEATURE_DISPOSITION_LOGGING`, `FEATURE_TASK_ARTIFACTS` | `upstream-divergent` | Phase 8 |
| 7 | Resource governance + Cost Tracker enforcement | Yes | `FEATURE_RESOURCE_GOVERNANCE`, `FEATURE_OPENCLAW_HEALTH_COSTS` | Mixed: governance core = `upstream-divergent`; OpenClaw health cost adapter = `fork-only optional` | Phase 8 |
| 8 | Product Line A pilot — end-to-end smoke | Pilot gate | `PILOT_PRODUCT_LINE_A_E2E` | Fork rollout only | Phase 9 |
| 9 | Product Line B onboarding | Post-pilot | — | Fork rollout only | — |

## SpecKit-Pro Autopilot Usage

Use `/speckit-pro:setup SPEC-###` in Claude Code, or `/speckit-setup SPEC-###` / `$speckit-setup SPEC-###` in Codex, to generate the workflow file for an individual spec.

Review the generated workflow prompts before running autopilot. Autopilot passes the populated phase prompts as-is; it does not enrich or repair weak source prompts later.

Then run `/speckit-pro:autopilot docs/ai/specs/SPEC-###-workflow.md` in Claude Code, or `/speckit-autopilot docs/ai/specs/SPEC-###-workflow.md` / `$speckit-autopilot docs/ai/specs/SPEC-###-workflow.md` in Codex.

Each spec should be executed from its generated worktree/branch. Existing phase sections below remain the canonical detailed source for scope, deliverables, acceptance criteria, rollback, and upstream-impact notes.

### Autopilot Ingestion Notes

These notes resolve known ambiguities so `/speckit-pro:setup` and `/speckit-pro:autopilot` can ingest this roadmap without operator clarification:

- **Tool count / tool names = "N/A":** every spec in this roadmap is non-tool-surface. `/speckit-pro:setup` MUST accept `N/A` as a valid value and skip MCP-tool-related artifacts. The autopilot workflow file should record `tools: []` and not fail the gate on missing tool descriptions.
- **Wikilinks `[[…]]`:** wikilink references in the PRD and this roadmap point to companion notes in the operator's Obsidian vault and are NOT required for autopilot ingestion. The information needed for autonomous execution is self-contained in this roadmap and the linked PRD (`docs/rc-factory-v1-prd.md`). Consensus agents should treat unresolvable wikilinks as informational only and proceed.
- **Migration count baseline:** the live `src/lib/migrations.ts` contains 50 migration entries spanning ids `001` through `052` (gap after `029` → `032`). The next available id slot is `053`, which this roadmap uses as `M53`.
- **SPEC-001 is migration-only.** Treat `clarify`, `checklist`, and `analyze` phases as minimal: zero `[NEEDS CLARIFICATION]` markers are expected; checklist gaps should resolve to "N/A — pure-schema spec"; analyze findings are limited to migration safety, idempotency, rollback-file presence, and the no-SQL safety gates. `/speckit.implement` performs the migration writes and the per-migration smoke checks listed in P0-AC1..AC14.
- **SPEC-009 has a human gate.** The pilot's "operator merges PR on GitHub" step is recorded as `G_PILOT_MERGE`. Autopilot stops after observing `ready_for_owner` and resumes (or marks complete) when `pullFromGitHub` records the linked PR merge. AC items P8-AC1, P8-AC6, P8-AC7 are explicitly MANUAL and live in the Pilot Smoke Checklist (`docs/qa/pilot-smoke-checklist.md`); they are NOT validated by `gate-validator`. P8-AC5 (PR merge → `done` transition) IS code-checkable via a webhook fixture and remains in the gate set.
- **Real-system smoke (Phase 8/9) wall-clock ACs are MANUAL:** P8-AC6 ("<4h wall-clock") and P9-AC1 ("<1 operator-hour") cannot be tested by `implement-executor` TDD. Each is recorded only in the Pilot Smoke Checklist and is asserted by the operator after the pilot run.
- **Issue #110 reproducibility:** if Product Line A GitHub issue #110 has been closed, deleted, or substantively mutated by the time SPEC-009 runs, the seed script falls back to creating a synthetic test issue with title `[mc-pilot] synthetic e2e issue` and labels `mc:inbox priority:medium area:dev`. The pilot smoke checklist documents both modes.

## SpecKit-Pro Status Policy

| Status | Meaning |
|---|---|
| Pending | Not yet set up by `/speckit-pro:setup`. |
| In Progress | Setup/worktree/workflow created. |
| Complete | Implementation PR merged and roadmap updated. |
| Blocked | Gate failure or human decision required. |

## SpecKit-Pro Spec Index

| Spec ID | Phase | Spec Name | Short Name | Status | Priority | Depends On | Enables | Source Section |
|---|---:|---|---|---|---|---|---|---|
| SPEC-001 | 0 | Foundation Migrations | foundation-migrations | Complete | P0 | — | SPEC-002 | Phase 0 |
| SPEC-002 | 1 | Product-Line Switcher and activeWorkspace Scoping | product-line-switcher | Pending | P1 | SPEC-001 | SPEC-003, SPEC-004, SPEC-005, SPEC-006, SPEC-007, SPEC-008, SPEC-009 | Phase 1 |
| SPEC-003 | 2 | Aegis Facility Singleton Refactor | global-aegis | Pending | P1 | SPEC-001, SPEC-002 | SPEC-004, SPEC-009 | Phase 2 |
| SPEC-004 | 3 | Task Pipeline Engine and Declarative Routing | task-pipeline-engine | Pending | P1 | SPEC-001, SPEC-002, SPEC-003 | SPEC-005, SPEC-007, SPEC-008, SPEC-009 | Phase 3 |
| SPEC-005 | 4 | ready_for_owner State and Two-Step Terminal Event | ready-for-owner | Pending | P1 | SPEC-002, SPEC-004 | SPEC-009 | Phase 4 |
| SPEC-006 | 5 | Area-Label GitHub Sync | area-label-github-sync | Pending | P1 | SPEC-001, SPEC-002 | SPEC-009 | Phase 5 |
| SPEC-007 | 6 | Disposition Logging and Task Artifact Store | disposition-artifacts | Pending | P2 | SPEC-002, SPEC-004 | SPEC-009 | Phase 6 |
| SPEC-008 | 7 | Resource Governance and Cost Tracker Enforcement | resource-governance | Pending | P2 | SPEC-001, SPEC-002, SPEC-004 | SPEC-009 | Phase 7 |
| SPEC-009 | 8 | Product Line A Pilot End-to-End Smoke | product-line-a-pilot | Pending | P0 | SPEC-001, SPEC-002, SPEC-003, SPEC-004, SPEC-005, SPEC-006, SPEC-007, SPEC-008 | SPEC-010 | Phase 8 |
| SPEC-010 | 9 | Product Line B Product-Line Onboarding | product-line-b-onboarding | Pending | P3 | SPEC-009 | — | Phase 9 |

## Feature Flag Resolution Policy

Every `FEATURE_*` flag named in this roadmap is resolved by a single helper, `resolveFlag(name, ctx)`, exported from `src/lib/feature-flags.ts` (added in SPEC-002 deliverables; consumed by every later phase):

1. **Hard-default OFF** — every flag's baseline value is `false`.
2. **Per-workspace JSON override (M56 storage):** `workspaces.feature_flags JSON` may contain `{ "FEATURE_X": true }` for a specific workspace; that value wins for that workspace.
3. **Process env override (emergency disable / kill-switch):** `process.env.FEATURE_X === '0'` ALWAYS forces the flag OFF regardless of JSON state. `process.env.FEATURE_X === '1'` does NOT force ON; only JSON can opt a workspace in.
4. **Global flag without workspace context:** when called with no workspace (e.g., from `auto-route` cron loops), resolution uses `workspace_id = null` → returns OFF unless an env var explicitly forces a value (rare, used only for `PILOT_PRODUCT_LINE_A_E2E`).

Phase deliverables that name a flag (e.g., `FEATURE_WORKSPACE_SWITCHER`, `FEATURE_GLOBAL_AEGIS`, `FEATURE_TASK_PIPELINES`, `FEATURE_TWO_STEP_TERMINAL`, `FEATURE_AREA_LABEL_ROUTING`, `FEATURE_DISPOSITION_LOGGING`, `FEATURE_TASK_ARTIFACTS`, `FEATURE_RESOURCE_GOVERNANCE`, `FEATURE_OPENCLAW_HEALTH_COSTS`, `PILOT_PRODUCT_LINE_A_E2E`) MUST resolve through this helper. Inline `process.env.FEATURE_X` checks are forbidden; CI greps for them and fails on match.

`PILOT_PRODUCT_LINE_A_E2E` is the one exception that may also be flipped via env (it is operator-temporary). All other flags route through `workspaces.feature_flags`.

## Spec Details for Autopilot Setup

### SPEC-001: Foundation Migrations

- **Status:** Complete
- **Priority:** P0
- **Branch short name:** `foundation-migrations`
- **Dependencies:** —
- **Enables:** SPEC-002; later specs consume Phase 0 schema after SPEC-002 adds the shared feature-flag resolver
- **Scope source:** Phase 0 — Foundation Migrations
- **Acceptance criteria source:** Phase 0 Acceptance Criteria
- **Scope summary:** Implement additive migrations and seed steps M53–M61, including agent scope, workflow-template routing/artifact-policy columns, task lineage, workspace feature flags, disposition/artifact tables, facility workspace seed, and resource policy tables. Sandbox terminology and `ready_for_owner` runtime vocabulary are explicit no-SQL safety gates here and ship as runtime work in later specs. No UI, config, type, or runtime behavior changes ship in SPEC-001.
- **Tool count / tool names:** N/A — not a tool-surface spec
- **Strict Scope:** N/A — migration-only/no-new-module spec
- **Autopilot notes:** Treat migrations as the only implementation surface. Verify live schema truth before assuming `agents.workspace_path` or a `tasks.status` CHECK constraint. Preserve null-default / flag-off compatibility and document upstream-divergent fork pressure.
- **Definition of done:** Phase 0 deliverables are implemented, P0 acceptance criteria pass, migrations are idempotent on production-shape data, existing tests pass unchanged, and rollback scripts plus documented manual reverse steps exist for each SQL-changing migration or seed.
- **Completion evidence:** Complete on PR #15 (`001-foundation-migrations`) after local verification and HAL UAT acceptance on 2026-04-26. HAL UAT confirmed M53-M61 migration markers, `PRAGMA quick_check = ok`, the `facility` workspace seed, Aegis/HAL/Security Guardian `scope='global'` backfill, and unchanged core app flows.

### SPEC-002: Product-Line Switcher and activeWorkspace Scoping

- **Status:** Pending
- **Priority:** P1
- **Branch short name:** `product-line-switcher`
- **Dependencies:** SPEC-001
- **Enables:** SPEC-003, SPEC-004, SPEC-005, SPEC-006, SPEC-007, SPEC-008, SPEC-009
- **Scope source:** Phase 1 — Product-Line Switcher + `activeWorkspace` Scoping
- **Acceptance criteria source:** Phase 1 Acceptance Criteria
- **Scope summary:** Add the feature-flagged Product Line switcher, independent `activeWorkspace` state, REST/SSE workspace scoping, filtered-panel behavior, aggregate-panel behavior, and header terminology fix so tenant/facility context is no longer labeled as Workspace.
- **Tool count / tool names:** N/A — not a tool-surface spec
- **Strict Scope:** `src/components/layout/workspace-switcher.tsx`, `src/types/product-line.ts`, `src/lib/feature-flags.ts`
- **Autopilot notes:** Keep `activeTenant` independent from `activeWorkspace`. The switcher’s Facility entry means aggregate/null view, not direct selection of the real `workspaces.slug='facility'` row. Global agents must appear across product-line views.
- **Definition of done:** Phase 1 deliverables are implemented, P1 acceptance criteria pass with flag OFF, null aggregate, and selected product-line modes, and no unauthorized workspace data leaks through REST or SSE scoping.

### SPEC-003: Aegis Facility Singleton Refactor

- **Status:** Pending
- **Priority:** P1
- **Branch short name:** `global-aegis`
- **Dependencies:** SPEC-001, SPEC-002
- **Enables:** SPEC-004, SPEC-009
- **Scope source:** Phase 2 — Aegis Refactor (Facility Singleton)
- **Acceptance criteria source:** Phase 2 Acceptance Criteria
- **Scope summary:** Refactor Aegis resolution from workspace-keyed lookup toward facility-wide `scope='global'` resolution, preserving compatibility-mode fallback for legacy workspace-scoped Aegis rows.
- **Tool count / tool names:** N/A — not a tool-surface spec
- **Strict Scope:** `src/lib/aegis.ts`
- **Autopilot notes:** Centralize lookup behavior in `getAegis`. Sweep all known Aegis references without changing review semantics. Use the live `quality_reviews.reviewer='aegis'` signal unless a separate migration intentionally changes that model.
- **Definition of done:** Phase 2 deliverables are implemented, P2 acceptance criteria pass for global-only, workspace-only, and legacy-local scenarios, and scheduler behavior remains unchanged with compatibility mode OFF.

### SPEC-004: Task Pipeline Engine and Declarative Routing

- **Status:** Pending
- **Priority:** P1
- **Branch short name:** `task-pipeline-engine`
- **Dependencies:** SPEC-001, SPEC-002, SPEC-003
- **Enables:** SPEC-005, SPEC-007, SPEC-008, SPEC-009
- **Scope source:** Phase 3 — Task Pipeline Engine + Declarative Routing
- **Acceptance criteria source:** Phase 3 Acceptance Criteria
- **Scope summary:** Implement feature-flagged task-chain behavior over `workflow_templates`, including template identity, task lineage, constrained JSON Schema validation using direct pinned `ajv`, safe routing-rule evaluation, successor-task creation, outbound sync parity, and workflow-template editor updates.
- **Tool count / tool names:** N/A — not a tool-surface spec
- **Strict Scope:** `src/lib/task-create.ts`, `src/lib/output-schema-validator.ts`, `src/lib/routing-rule-evaluator.ts`, `src/types/workflow-template.ts`
- **Autopilot notes:** Do not introduce a `task_templates` SQL table. A task-chain template is a domain alias over `workflow_templates`. With the feature flag OFF or fields NULL, task completion must behave exactly as before. Phase 3 reads structured output from `tasks.resolution`; Phase 6 later upgrades artifact handoff.
- **Definition of done:** Phase 3 deliverables are implemented, P3 acceptance criteria pass for valid routing, invalid output, fallback, termination, side-effect parity, dependency pinning, validator constraints, and repository documentation refresh.

### SPEC-005: ready_for_owner State and Two-Step Terminal Event

- **Status:** Pending
- **Priority:** P1
- **Branch short name:** `ready-for-owner`
- **Dependencies:** SPEC-002, SPEC-004
- **Enables:** SPEC-009
- **Scope source:** Phase 4 — `ready_for_owner` State + Two-Step Terminal Event
- **Acceptance criteria source:** Phase 4 Acceptance Criteria
- **Scope summary:** Add feature-flagged `ready_for_owner` runtime behavior for PR-producing templates, including Kanban lane, GitHub status label, Aegis approval branching, PR-merge transition to `done`, reconciliation alert on issue closure without merged PR, and notification type.
- **Tool count / tool names:** N/A — not a tool-surface spec
- **Strict Scope:** `src/lib/notifications.ts`
- **Autopilot notes:** Non-PR-producing templates must continue to complete directly to `done`. `produces_pr=true` tasks must not become `done` until linked PR merge is observed.
- **Definition of done:** Phase 4 deliverables are implemented, P4 acceptance criteria pass for flag OFF, non-PR templates, PR-producing templates, merged PR transition, closed-issue reconciliation, Kanban rendering, and GitHub label sync.

### SPEC-006: Area-Label GitHub Sync

- **Status:** Pending
- **Priority:** P1
- **Branch short name:** `area-label-github-sync`
- **Dependencies:** SPEC-001, SPEC-002
- **Enables:** SPEC-009
- **Scope source:** Phase 5 — Area-Label GitHub Sync
- **Acceptance criteria source:** Phase 5 Acceptance Criteria
- **Scope summary:** Add feature-flagged `area:*` label routing and repo-level sync ownership/dedupe so multiple department projects can share one product-line monorepo without duplicate polling or duplicate ingestion.
- **Tool count / tool names:** N/A — not a tool-surface spec
- **Strict Scope:** N/A unless the optional `projects.area_slug` path introduces new TS/TSX modules; existing-file edits remain outside strict-scope expansion
- **Autopilot notes:** Keep existing GitHub sync behavior unchanged when the flag is OFF. Use one repo-level owner or equivalent dedupe path per `(workspace_id, github_repo)`; the existing uniqueness constraint is a guardrail, not the routing strategy.
- **Definition of done:** Phase 5 deliverables are implemented, P5 acceptance criteria pass for no-duplicate ingestion, resolvable area routing, triage fallback, ambiguity activity, outbound area labels, and idempotent label provisioning.

### SPEC-007: Disposition Logging and Task Artifact Store

- **Status:** Pending
- **Priority:** P2
- **Branch short name:** `disposition-artifacts`
- **Dependencies:** SPEC-002, SPEC-004
- **Enables:** SPEC-009
- **Scope source:** Phase 6 — Disposition Logging + Artifact Store + Admin Panels
- **Acceptance criteria source:** Phase 6 Acceptance Criteria
- **Scope summary:** Add feature-flagged triage disposition inserts, Mission Control-owned task artifact publishing/consumption, disposition audit view, artifact admin/health surface, dashboard rollups, and documented morning-briefing query integration.
- **Tool count / tool names:** N/A — not a tool-surface spec
- **Strict Scope:** `src/lib/task-artifacts.ts`, `src/app/api/task-artifacts/route.ts`, `src/app/api/task-artifacts/[id]/route.ts`, `src/components/panels/artifact-admin-panel.tsx`, `src/app/api/dispositions/route.ts`
- **Autopilot notes:** Insert one disposition row per triage template completion when enabled, but never block task advancement on insert failure. Successor dispatch should consume MC artifact references/previews rather than another agent’s private sandbox.
- **Definition of done:** Phase 6 deliverables are implemented, P6 acceptance criteria pass for disposition logging, failure isolation, filters, rollups, artifact publish/consume, secret handling, storage health metrics, and admin maintenance actions.

### SPEC-008: Resource Governance and Cost Tracker Enforcement

- **Status:** Pending
- **Priority:** P2
- **Branch short name:** `resource-governance`
- **Dependencies:** SPEC-001, SPEC-002, SPEC-004
- **Enables:** SPEC-009
- **Scope source:** Phase 7 — Resource Governance + Cost Tracker Enforcement
- **Acceptance criteria source:** Phase 7 Acceptance Criteria
- **Scope summary:** Extend Cost Tracker into feature-flagged scheduler enforcement for WIP, blackout/degraded windows, budgets, policy events, operator overrides, and optional runtime-only OpenClaw electricity/infra cost visibility.
- **Tool count / tool names:** N/A — not a tool-surface spec
- **Strict Scope:** `src/lib/resource-governance.ts`, `src/app/api/resource-policies/route.ts`, `src/app/api/resource-policy-events/route.ts`, `src/lib/openclaw-health-costs.ts`
- **Autopilot notes:** Do not duplicate token/cost telemetry. `FEATURE_RESOURCE_GOVERNANCE=false` preserves legacy scheduler behavior. `FEATURE_OPENCLAW_HEALTH_COSTS` is fork-only optional, runtime-only, absent-safe, and must require no v1 schema migration.
- **Definition of done:** Phase 7 deliverables are implemented, P7 acceptance criteria pass for legacy behavior, empty-policy allow, WIP limits, blackout/degraded windows, soft/hard budgets, subscription raw-usage enforcement, OpenClaw absence safety, valid telemetry display, and fail-safe policy evaluation.

### SPEC-009: Product Line A Pilot End-to-End Smoke

- **Status:** Pending
- **Priority:** P0
- **Branch short name:** `product-line-a-pilot`
- **Dependencies:** SPEC-001, SPEC-002, SPEC-003, SPEC-004, SPEC-005, SPEC-006, SPEC-007, SPEC-008
- **Enables:** SPEC-010
- **Scope source:** Phase 8 — Product Line A Pilot (End-to-End Smoke)
- **Acceptance criteria source:** Phase 8 Acceptance Criteria
- **Scope summary:** Activate Phase 1–7 feature flags for Product Line A, seed the workspace, departments, agent assignments, workflow templates, GitHub repo routing, existing issue intake, conservative governance policies, and run issue #110 then #111 through the full workflow.
- **Tool count / tool names:** N/A — not a tool-surface spec
- **Strict Scope:** `scripts/seed-product-line-a-workspace.ts` if authored in TypeScript; otherwise N/A for docs/config/SQL-only seed assets
- **Autopilot notes:** This is an integration smoke spec, not new architecture design. Preserve existing GitHub linkage and sync metadata for previously synced Product Line A issues. Operator intervention is allowed only for final PR merge in the primary pilot path.
- **Definition of done:** Phase 8 deliverables are implemented, P8 acceptance criteria pass for issue #110 end-to-end, disposition record, stage assignments, Aegis approval, `ready_for_owner → done` transition, audit trail, wall-clock target, and governance compliance.

### SPEC-010: Product Line B Product-Line Onboarding

- **Status:** Pending
- **Priority:** P3
- **Branch short name:** `product-line-b-onboarding`
- **Dependencies:** SPEC-009
- **Enables:** —
- **Scope source:** Phase 9 — Product Line B Onboarding (Scale Validation)
- **Acceptance criteria source:** Phase 9 Acceptance Criteria
- **Scope summary:** Generalize product-line seeding, onboard Product Line B as the second product line, provision isolated agents, adapt workflow templates, configure the canonical repo, and run a first real issue smoke.
- **Tool count / tool names:** N/A — not a tool-surface spec
- **Strict Scope:** `scripts/seed-product-line.ts` if authored in TypeScript; otherwise N/A for docs/config/SQL-only seed assets
- **Autopilot notes:** Validate scale and repeatability rather than redesigning the architecture. Product Line A must remain unaffected. Facility agents serve both product lines while product-line agents remain strictly isolated.
- **Definition of done:** Phase 9 deliverables are implemented, P9 acceptance criteria pass for sub-1-hour onboarding, strict agent isolation, shared facility agents, and per-workspace dashboard disposition metrics.

---

## Fork Decision Gates

These are the points where the owner should explicitly decide whether continued upstream compatibility is still the goal or whether a permanent fork is being accepted.

1. **After Phase 0** — additive schema tail starts (`M53–M61`). If this is not acceptable fork pressure, stop and redesign around upstream-safe adapters or upstream contributions before coding farther.
2. **After Phase 3/4** — workflow/state-machine semantics become upstream-divergent, not just schema-divergent.
3. **After Phase 6** — artifact/disposition persistence deepens the fork if upstream does not want those tables.
4. **Phase 7 OpenClaw health costs** — safe to keep fork-only because it is adapter-based and optional; this does **not** by itself justify a permanent fork.

---

## Phase 0 — Foundation Migrations

### Scope

Foundation migrations/seed steps M53–M61 (nine additive SQL-changing migrations/seed steps) plus two no-SQL safety gates for Sandbox terminology and `ready_for_owner` status vocabulary. Pure schema work. No UI, config, type, or runtime behavior changes.

### Upstream Impact

`upstream-divergent`. Runtime-safe for current installs, but these migrations create schema/state that upstream does not currently have. Phase 0 is the first explicit fork-pressure checkpoint.

### Deliverables

- **Safety gate: Sandbox terminology** — live schema verification on 2026-04-24 confirms `agents.workspace_path` DOES exist (added by an earlier migration that conditionally runs `ALTER TABLE agents ADD COLUMN workspace_path TEXT`). SPEC-001 keeps the SQL column name `workspace_path` as-is, does not add `sandbox_path`, and does not ship UI/config/type/doc terminology changes. Sandbox runtime/copy cleanup belongs to SPEC-002+.
- **Safety gate: `ready_for_owner` vocabulary** — live schema verification on 2026-04-24 confirms `tasks.status` is `TEXT NOT NULL DEFAULT 'inbox'` with NO database CHECK constraint (only an inline comment listing valid values at `src/lib/schema.sql:9`). SPEC-001 makes no DB-level CHECK change and does not extend TypeScript/Zod/GitHub-label/Kanban/runtime vocabulary. Application-level support belongs to SPEC-005.
- **M53** — `agents.scope` column + backfill of Aegis / Security Guardian / HAL (`LOWER(name) IN ('aegis','security-guardian','hal')`) to `global`.
- **M54** — `workflow_templates` gains task-chain and artifact-policy columns: `slug`, `output_schema`, `routing_rules`, `next_template_slug`, `produces_pr`, `external_terminal_event`, `allow_redacted_artifacts`. A "task-chain template" is a domain alias over `workflow_templates`, not a new SQL table.
- **M55** — `tasks` gains workflow-template binding and lineage: `workflow_template_id`, `workflow_template_slug`, `parent_task_id`, `root_task_id`, `chain_id`, `chain_stage`.
- **M56** — `workspaces.feature_flags JSON` stores per-product-line feature-flag overrides. `NULL` = hardcoded default OFF.
- **M57** — `task_dispositions` table + index.
- **M58** — `task_artifacts` table + indexes. Use `workflow_template_slug` in artifact metadata.
- **M59** — seed `workspaces` with `slug='facility'`, `name='Facility'`, and a resolved default tenant (`ORDER BY active status, id ASC`), using the live `name` column, not `display_name` (idempotent; do not hardcode `tenant_id=1`).
- **M60** — `resource_policies` table + scope indexes, using `workflow_template_slug` nomenclature.
- **M61** — `resource_policy_events` table + audit indexes.

### Files Touched

- `src/lib/migrations.ts` (append migrations/seed steps after verifying live schema shape)
- `src/lib/schema.sql` (read-only reference for schema-shape assertions; do not edit unless fresh-install migration ordering is explicitly tested)

### Acceptance Criteria

- [P0-AC1] All migrations run clean on an existing production-shape database.
- [P0-AC2] Migration is idempotent (re-running applies no changes).
- [P0-AC3] `SELECT * FROM agents WHERE scope='global'` returns the three backfilled globals.
- [P0-AC4] `SELECT slug, name FROM workspaces WHERE slug='facility'` returns exactly one row.
- [P0-AC5] `PRAGMA table_info(workflow_templates)` shows the task-chain columns plus `allow_redacted_artifacts`; the partial unique index on `(workspace_id, slug)` exists for non-null slugs.
- [P0-AC6] `PRAGMA table_info(tasks)` shows workflow-template binding and lineage columns.
- [P0-AC7] `PRAGMA table_info(workspaces)` shows `feature_flags`; SPEC-001 validates only the storage column and `NULL` default. Runtime flag resolution is tested in SPEC-002 when `resolveFlag()` is introduced.
- [P0-AC8] `task_artifacts` table queryable; indexes exist for `(task_id, created_at)` and `(workspace_id, artifact_type)`.
- [P0-AC9] `resource_policies` and `resource_policy_events` are queryable; indexes exist for policy scope and policy events by task/time.
- [P0-AC10] Existing test suite passes unchanged (no new behavior yet).
- [P0-AC11] One rollback file exists for each SQL-changing migration or seed: `docs/migrations/rollback-M53.sql` through `docs/migrations/rollback-M61.sql`; each file contains guarded reverse SQL with explicit preconditions, using idempotent `IF EXISTS` forms where SQLite permits them.
- [P0-AC12] `docs/migrations/rollback-procedure.md` exists and documents reverse order, SQLite column-rebuild rollback guidance, and pre-rollback DB snapshot step.
- [P0-AC13] The `ready_for_owner` safety gate makes no DB-level CHECK change and no application-level status-vocabulary change; ripgrep over the SPEC-001 diff finds zero occurrences of `CHECK (status`, `ready_for_owner`, or `mc:ready-for-owner` outside docs and rollback commentary.
- [P0-AC14] The Sandbox terminology safety gate makes no `ALTER TABLE agents RENAME COLUMN`, no `ALTER TABLE agents ADD COLUMN sandbox_path`, and no UI/config/type/doc-copy rename outside SPEC-001 documentation; ripgrep over the diff confirms zero such statements or runtime copy changes.

### Rollback

The live migration runner (`src/lib/migrations.ts:5-9`) is forward-only — `type Migration = { id: string; up: (db) => void }` has no `down()` function. Rollback for Phase 0 is therefore documented as **manual reverse SQL**, not an automated `down()`:

- Each SQL-changing M5x migration ships a paired reverse-SQL file at `docs/migrations/rollback-M53.sql` through `docs/migrations/rollback-M61.sql` (created as part of SPEC-001 deliverables) that contains explicit guarded reverse SQL. M53-M56 use transactional table rebuilds; M57, M58, M60, and M61 use `DROP TABLE`; M59 uses guarded `DELETE FROM workspaces WHERE slug='facility'` only when no migration-052 workspace-scoped table still references the facility row.
- An operator runbook at `docs/migrations/rollback-procedure.md` describes the reverse order (M61 -> M53), SQLite column-rebuild rollback behavior, and the safety pre-checks (snapshot the DB file first).
- Rollback is operator-initiated by manually applying the documented reverse SQL after taking the DB snapshot. SPEC-001 adds no rollback CLI surface.
- A future spec may extend `Migration` with an optional `down?: (db) => void` and a CLI runner; that work is **out of scope for SPEC-001** and is tracked separately.

### Estimated Work

1–2 engineering days for migrations, +0.5 day for the paired rollback SQL files and operator runbook. Zero UI, zero runtime logic.

---

## Phase 1 — Product-Line Switcher + `activeWorkspace` Scoping

### Scope

Introduce the product-line switcher in the header, wire Zustand `activeWorkspace`, and apply hybrid filter/aggregate behavior per D4b. `activeTenant` remains the super-admin / tenant context and must not be reused as the Product Line switcher. The header must stop labeling tenant context as "Workspace." Gate everything behind `FEATURE_WORKSPACE_SWITCHER`.

### Upstream Impact

`upstream-safe`. This is additive UI/domain work and a plausible upstream candidate if kept generic.

### Deliverables

- **Header terminology fix**: `header-bar.tsx` must not render `activeTenant` under a "Workspace" label. Tenant/facility context and Product Line context are separate UI chips/controls.
- **New component**: `src/components/layout/workspace-switcher.tsx`.
  - Dropdown in `header-bar.tsx`.
  - Options: all workspaces user can access (`GET /api/workspaces`) plus "Facility" (null) entry.
  - Persists selection via Zustand `persist` middleware (see new persistence note below).
- **Zustand store**: `activeWorkspace: Workspace | null` with cross-tab sync.
  - **Live state on 2026-04-24:** `src/store/index.ts:4` imports only `subscribeWithSelector`; there is **no existing `persist` middleware** and **no `BroadcastChannel` cross-tab listener** in this codebase. SPEC-002 must therefore implement cross-tab sync from scratch, not piggyback on a non-existent pattern.
  - **Implementation contract:** wrap the `activeWorkspace` slice with `zustand/middleware`'s `persist` (storage = `localStorage`, key = `mc:active-workspace:v1`). Add a `BroadcastChannel('mc:active-workspace')` listener so tab A's `setActiveWorkspace` triggers a refresh in tab B. Fall back gracefully when `BroadcastChannel` is unavailable (no-op; only the persisted value is shared at next reload).
  - **Scope discipline:** only the `activeWorkspace` slice is wrapped; the rest of the store is unaffected. Other slices keep current persistence semantics.
- **TypeScript domain type**: `type ProductLine = Workspace` alias exported from `@/types/product-line`.
- **REST scoping contract**: filtered endpoints accept an optional requested `workspace_id`/product-line scope, authorize it with tenant/workspace access checks, then query the requested workspace. Omitted scope preserves existing authenticated-workspace behavior unless the endpoint is explicitly facility aggregate.
- **SSE scoping contract**: `/api/events` supports authorized product-line filtering for non-null `activeWorkspace` and authorized facility/tenant aggregation for null `activeWorkspace`, without leaking events outside the caller's tenant/access set.
- **Filtered panels** (pass requested workspace scope when `activeWorkspace` set):
  - `task-board-panel.tsx` — already has `projectFilter`; extend with `workspaceFilter`.
  - `agent-squad-panel-phase3.tsx` — group by Facility → ProductLine → Department → Agent.
  - `project-manager-modal.tsx` — list projects for `activeWorkspace` only.
  - `chat-panel.tsx`, `chat-page-panel.tsx` — list chats from `activeWorkspace`.
  - `skills-panel.tsx` — list skills from `activeWorkspace` + facility (default facility-wide).
- **Aggregate panels** (no change — ignore `activeWorkspace`):
  - `live-feed.tsx`, `notifications-panel.tsx`, `dashboard.tsx`, `system-monitor-panel.tsx`, `audit-trail-panel.tsx`.
- **API endpoints**: accept optional `workspace_id` query param where relevant. Null defaults to aggregate.

### Files Touched (estimated)

- `src/components/layout/header-bar.tsx` (~30 lines added; remove `activeTenant` "Workspace" label per P1-AC8)
- `src/components/layout/workspace-switcher.tsx` (new, ~200 lines)
- `src/store/index.ts` (add `activeWorkspace` slice + `persist` middleware + `BroadcastChannel` listener; the live store path is `src/store/index.ts`, not `src/store/mission-control-store.ts`)
- `src/components/panels/task-board-panel.tsx` (~20 lines modified)
- `src/components/panels/agent-squad-panel-phase3.tsx` (~80 lines — hierarchical grouping logic)
- `src/components/panels/project-manager-modal.tsx`, `chat-panel.tsx`, `chat-page-panel.tsx`, `skills-panel.tsx` (minor)
- `src/app/api/tasks/route.ts`, `src/app/api/agents/route.ts`, `src/app/api/projects/route.ts` (accept `workspace_id` query param)
- `src/types/product-line.ts` (new)
- `src/lib/feature-flags.ts` (new — see Feature Flag Resolution Policy section)

### Acceptance Criteria

- [P1-AC1] With flag OFF, the existing Vitest + Playwright test suite (`pnpm test:all`) passes unchanged from the pre-Phase-1 baseline commit. "Zero regression" is defined as: 0 new test failures, 0 changed test counts, and 0 visible diffs in the existing Playwright snapshot suite (`tests/e2e/snapshots/*`).
- [P1-AC2] With flag ON and `activeWorkspace = null`, the same `pnpm test:all` suite passes unchanged (facility-aggregate view is byte-equivalent to flag-OFF for existing tests).
- [P1-AC3] The "Facility" dropdown entry corresponds to `activeWorkspace = null` (Facility aggregate view per P1-AC2), **not** the real `workspaces.slug='facility'` row. The real facility workspace is never selected directly through the switcher; it hosts `scope='global'` agents (Aegis, Security Guardian, OpenClaw) that surface across every product-line view. Agent squad and other filtered panels MUST render these globals alongside workspace-scoped agents regardless of `activeWorkspace`.
- [P1-AC4] With flag ON and `activeWorkspace = product-line-a` (pre-seeded), filtered panels show only Product Line A data; aggregate panels show everything.
- [P1-AC5] Agent squad panel renders hierarchical tree: Facility (globals) → Product Line A → {QA, Dev, ...} → {agents}.
- [P1-AC6] Cross-tab state sync: a Playwright test that opens two browser contexts, sets `activeWorkspace` in context A, and observes the change reflected in context B within 1s passes. When `BroadcastChannel` is unavailable (older browser stub), the persisted value still propagates after a context-B reload.
- [P1-AC7] `activeTenant` remains independent from `activeWorkspace`; switching product lines does not mutate tenant context.
- [P1-AC8] Header no longer labels tenant context as "Workspace." Specifically, ripgrep over `src/components/layout/header-bar.tsx` finds zero string matches for `'workspace'` used as a tenant-context label; tenant context is labeled "Tenant" or shown without a label.
- [P1-AC9] `/api/tasks`, `/api/agents`, `/api/projects`, and `/api/quality-review` return the authorized requested workspace when `activeWorkspace` is set. Vitest covers the request shape: `GET /api/tasks?workspace_id=2` returns only workspace 2's tasks for an authorized user; returns 403 for an unauthorized user.
- [P1-AC10] `/api/events` returns authorized product-line-filtered events for a selected product line and authorized aggregate events in facility view. Vitest covers both branches with stubbed event sources.
- [P1-AC11] `src/store/index.ts` exports the `activeWorkspace` slice wrapped with `persist` middleware (key `mc:active-workspace:v1`, storage `localStorage`); the slice subscribes to a `BroadcastChannel('mc:active-workspace')` and updates state on `message` events. Vitest unit-tests both serialization and broadcast handling with a JSDOM stub.

### Rollback

Flip `FEATURE_WORKSPACE_SWITCHER` to OFF. Switcher hidden. Zustand field ignored.

### Estimated Work

5–7 engineering days.

---

## Phase 2 — Aegis Refactor (Facility Singleton)

### Scope

Replace the `aegisAgentByWorkspace = new Map<number, ReviewAgentRecord>()` declaration at `src/lib/task-dispatch.ts:394` (used at line 422 for `.get()` and line 435 for `.set()`) with a global Aegis lookup via the new `getAegis(db, workspace_id?)` helper. The function `runAegisReviews` starts at `src/lib/task-dispatch.ts:376`; `resolveGatewayAgentIdForReviewAgent` is at `src/lib/task-dispatch.ts:80`. Preserve a shim for legacy workspace-scoped Aegis rows. Touch the ~60+ references cataloged during Q1 verification.

### Upstream Impact

`upstream-divergent` because this design depends on `agents.scope` from Phase 0.

### Known Reference Surface (from Q1 verification)

- `src/app/api/tasks/route.ts` — `hasAegisApproval` DB gate
- `src/app/api/tasks/[id]/route.ts`
- `src/lib/validation.ts`
- `src/lib/scheduler.ts` — `aegis_review` cron task
- `src/lib/task-dispatch.ts` — `runAegisReviews`, `resolveGatewayAgentIdForReviewAgent`, `aegisAgentByWorkspace`
- `src/components/panels/task-board-panel.tsx` — Aegis review UI hooks
- `src/components/chat/*` — Aegis chat surfaces

### Deliverables

- **Helper**: `src/lib/aegis.ts` — `getAegis(db, workspace_id?)` returns the global Aegis (scope=global) OR a legacy workspace-scoped Aegis as fallback. Resolution order documented below.
- **Refactor**: `src/lib/task-dispatch.ts:80` (`resolveGatewayAgentIdForReviewAgent`) and `src/lib/task-dispatch.ts:376` (`runAegisReviews`, which currently declares the workspace-keyed map at line 394) use `getAegis` instead of the local map.
- **Cleanup**: remove the `aegisAgentByWorkspace` map (line 394) once all callers migrated. Leave the legacy-row fallback inside `getAegis`.
- **Feature flag**: `FEATURE_GLOBAL_AEGIS` — when OFF, `getAegis` returns workspace-scoped Aegis first (preserves prior behavior); when ON, global first.
- **Resolution precedence (ON):** (1) the unique `agents` row with `scope='global'` AND `LOWER(name)='aegis'` wins; (2) if no global row exists, fall back to a workspace-scoped row matching `workspace_id = :workspace AND LOWER(name)='aegis'`; (3) if both exist, the global row wins and an `activities` row is written documenting that the workspace-scoped row was shadowed (for audit visibility during the migration window).
- **Resolution precedence (OFF):** workspace-scoped row first, then global, mirroring the legacy code path.

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
- [P2-AC3] If a workspace has a legacy local Aegis record, `getAegis(ws)` returns the local one when compatibility mode requires it. Legacy records can be manually cleaned up later.
- [P2-AC4] `runAegisReviews` scheduler loop runs identically. No new failure modes.
- [P2-AC5] Test suite covers: global-only, workspace-only, workspace-with-legacy (all three scenarios).
- [P2-AC6] Aegis completion gates use the live `quality_reviews.reviewer='aegis'` signal unless a separate migration intentionally adds `quality_reviews.agent_id`; no Phase 2 smoke/test should expect `quality_reviews.agent_id` by default.

### Rollback

Flip `FEATURE_GLOBAL_AEGIS` OFF. `getAegis` reverts to workspace-first resolution.

### Estimated Work

4–5 engineering days. Most of the risk is in the reference sweep, not the logic.

---

## Phase 3 — Task Pipeline Engine + Declarative Routing

### Scope

Extend the live `workflow_templates` table with routing machinery (per D5). A "task-chain template" is a domain alias over `workflow_templates`, not a new SQL table. Implement schema validation, routing-rule evaluation, and successor-task creation in the scheduler. Ship behind `FEATURE_TASK_PIPELINES`.

### Upstream Impact

`upstream-divergent`. This phase depends on new `workflow_templates` and `tasks` binding/lineage schema and introduces task-chain semantics upstream Mission Control does not currently expose.

### Deliverables

- **Workflow-template identity**: `workflow_templates.slug` supports stable per-workspace declarative routing. `workflow_template_id` is the canonical task binding; `workflow_template_slug` is a denormalized snapshot for readability/routing history.
- **Task lineage**: successor tasks set `parent_task_id`, `root_task_id`, `chain_id`, and `chain_stage` so operators can trace multi-stage workflows.
- **Shared `createTask()` helper** (prerequisite for FR-D4a / NFR-13 successor side-effect parity): SPEC-004 first extracts a single task-creation function in `src/lib/task-create.ts` that performs INSERT, ticket-counter allocation, activity logging, creator subscription, mention/assignee notifications, and outbound sync (`pushTaskToGitHub` if the project has `github_sync_enabled` and `github_repo`, plus `pushToGnap` if configured). The four current callsites that issue `INSERT INTO tasks` directly (`src/app/api/tasks/route.ts:218`, `src/app/api/github/route.ts:159`, `src/lib/github-sync-engine.ts:189`, `src/lib/recurring-tasks.ts:105`) are migrated to call `createTask`. Routing-engine successor creation calls the same `createTask` — no parallel code path. CI greps for direct `INSERT INTO tasks` outside `src/lib/task-create.ts` and fails on match.
- **Schema validation library**: `src/lib/output-schema-validator.ts` — server-side JSON Schema validator using `ajv` as an explicit direct pinned dependency. Do not import transitive `ajv`. Configure a constrained Mission Control schema profile with the following **numeric bounds**:
  - `maxOutputBytes = 256 * 1024` (256 KiB raw output before parse)
  - `maxSchemaBytes = 64 * 1024` (64 KiB compiled schema source)
  - `maxNestingDepth = 16` for both schema and parsed output
  - `maxKeysPerObject = 256`
  - `maxArrayLength = 1024`
  - `maxStringLength = 32 * 1024`
  - `maxPatternLength = 256` characters
  - `maxValidationMs = 50` (per-call wall-clock; AJV `useDefaults`/`allErrors` configured to keep within this budget)
  - Forbidden: remote `$ref` (only `#/...` local refs), `$dynamicRef`, `$dynamicAnchor`, custom keywords, async schemas, the `format` validator (allow only `format` annotations without enforcement), and any `pattern` not whitelisted via `safe-regex` (CI fails on `safe-regex` rejection).
  - Compiled validators are cached per `(template_id, schema_sha256)`; cache size capped at 256 entries with LRU eviction.
- **Routing expression evaluator**: `src/lib/routing-rule-evaluator.ts` — safe-subset expression language:
  - Operators: `==`, `!=`, `in`, `not in`, `&&`, `||`, `!`.
  - Left-side: JSONPath-Plus path into output (e.g., `$.disposition`, `$.details.severity`). Implementation MUST use `jsonpath-plus` with `eval: 'safe'` (or `preventEval: true` per the library's current config) — explicitly NOT raw `eval`, `Function`, `vm`, or `vm2`.
  - Right-side: literal string, number, boolean, or array of literals.
  - Forbidden: function calls, dynamic property access, prototype chain access (`__proto__`, `constructor`), arithmetic (`+`, `-`, `*`, `/`), bitwise ops, regex on the right-hand side, and any operator not on the explicit allowlist.
  - The evaluator is implemented as a hand-written recursive-descent parser over the allowlisted grammar; it does NOT delegate parsing to a general-purpose expression library. Tests include adversarial inputs (prototype pollution attempts, deeply nested expressions, malformed JSONPath, oversized literals).
  - Per-call evaluation budget: `maxRuleEvalMs = 10`; rule sets exceeding the budget short-circuit and route the task to triage with an `activities` row.
- **Scheduler extension**: new `advanceTaskChain` function invoked on successful task completion.
  1. Read structured output from `tasks.resolution` in Phase 3 as the temporary bridge before Phase 6 artifact publishing exists.
  2. Validate output against `workflow_template.output_schema` — fail → task → `failed`.
  3. Evaluate `workflow_template.routing_rules` in order — first match wins.
  4. If no rule matches, use `workflow_template.next_template_slug`.
  5. If neither resolves, chain terminates normally.
  6. On resolution, build the successor input: inherit `workspace_id`, `project_id`; set binding/lineage fields (`workflow_template_id`, `workflow_template_slug`, `parent_task_id`, `root_task_id`, `chain_id`, `chain_stage = parent.chain_stage + 1`); resolve `assigned_to` from the live join `SELECT a.name FROM project_agent_assignments paa JOIN agents a ON a.name = paa.agent_name WHERE paa.project_id = :project_id AND paa.role = :workflow_template.agent_role LIMIT 1` (note: `project_agent_assignments` is keyed by `agent_name`, not `agent_id`, per the live schema at `src/lib/migrations.ts:825-836`); parametrize description with output variables.
  7. Pass that input to the shared `createTask()` helper (defined above). All outbound sync (GitHub, GNAP), activity logging, ticket-counter allocation, subscriptions, and notifications happen inside `createTask` — successor creation does NOT inline any of that logic. NFR-13 (successor side-effect parity) is enforced structurally by sharing the function, not by parallel implementation.
- **Template UI**: extend `settings-panel.tsx` workflow-template editor with `slug`, `output_schema`, `routing_rules`, `next_template_slug`, `produces_pr`, `external_terminal_event`, and `allow_redacted_artifacts` fields.
- **Repository docs update**: update `docs/orchestration.md` in the implementation repo when declarative auto-chaining ships. The doc should keep manual follow-up tasks as a supported pattern, add a feature-flagged declarative task-chain section, and refresh lifecycle/status terminology.

### Files Touched

- `src/lib/task-create.ts` (new, ~250 lines) — extracted shared `createTask()` helper consumed by all callsites and the routing engine
- `src/app/api/tasks/route.ts:218`, `src/app/api/github/route.ts:159`, `src/lib/github-sync-engine.ts:189`, `src/lib/recurring-tasks.ts:105` — migrate to `createTask()`
- `src/lib/output-schema-validator.ts` (new, ~150 lines including bounds enforcement)
- `src/lib/routing-rule-evaluator.ts` (new, ~250 lines including hand-written parser + adversarial tests)
- `src/lib/task-dispatch.ts` — add `advanceTaskChain` hook
- `src/lib/scheduler.ts` — call `advanceTaskChain` on successful completion
- `src/components/panels/settings-panel.tsx` — UI for new workflow-template fields
- `src/types/workflow-template.ts` — add new field types
- `package.json`, `pnpm-lock.yaml` — add pinned direct `ajv` and `jsonpath-plus` dependencies; CI verifies they are direct and lockfile-pinned, and runs `safe-regex` over all referenced schemas
- `docs/orchestration.md` — update repository documentation when Phase 3 ships

### Acceptance Criteria

- [P3-AC1] With flag OFF, task completion behaves exactly as today (no chain advance regardless of workflow-template fields).
- [P3-AC2] With flag ON and all new workflow-template fields NULL, behavior matches flag-OFF (null-default safety).
- [P3-AC3] With a bound workflow template that has `output_schema` set and valid agent output in `tasks.resolution`, successor task is created per `routing_rules` / `next_template_slug`.
- [P3-AC4] With a bound workflow template that has `output_schema` set and INVALID agent output, task transitions to `failed` and no successor is created.
- [P3-AC5] Routing expression evaluator rejects unsafe inputs. Vitest covers each forbidden category with an adversarial fixture: `__proto__` access, `constructor` access, attempted invocation of `Function`, attempted invocation of the global code-evaluation primitive, arithmetic operators (`a + b`, `a - 1`), bitwise operators (`a & 1`), regex on right-hand side, malformed JSONPath (`$..`, `$[?@.x>0]`), and oversized literal strings (>32 KiB). Each test asserts the evaluator returns a structured rejection (no exception leak, no successor created).
- [P3-AC6] Successor task inherits `workspace_id`, `project_id`; assignee correctly resolved from `project_agent_assignments` via the documented join (`paa.role = template.agent_role` AND `paa.agent_name = agents.name`); lineage fields are populated (`parent_task_id`, `root_task_id`, `chain_id`, `chain_stage`).
- [P3-AC6a] Successor creation calls the shared `createTask()` helper. Vitest asserts the helper is called exactly once per successor, with all expected side effects (activity row, ticket counter increment, subscription, GitHub push if `github_sync_enabled`, GNAP push if `gnap_sync_enabled`). Ripgrep over `src/` finds zero `INSERT INTO tasks` statements outside `src/lib/task-create.ts`.
- [P3-AC7] Unit tests cover: valid routing, invalid output, no-match fallback to static next, chain terminate (no successor).
- [P3-AC8] `ajv` AND `jsonpath-plus` are present as direct pinned dependencies in `package.json` and `pnpm-lock.yaml`; ripgrep finds no transitive-only imports of either.
- [P3-AC9] Validator enforces every numeric bound listed in the deliverables (256 KiB output, 64 KiB schema, depth 16, keys 256, array 1024, string 32 KiB, pattern 256 chars, validation 50 ms) AND rejects: remote `$ref`, `$dynamicRef`, `$dynamicAnchor`, custom keywords, async schemas, the `format` validator, and any pattern not whitelisted by `safe-regex`. Each rejection has a Vitest fixture.
- [P3-AC10] Compiled validators are cached per `(template_id, schema_sha256)` with LRU eviction at 256 entries; schema validation p95 over 1000 random valid outputs remains ≤ 50 ms (matching PRD NFR-6's +50 ms budget). Measured by Vitest with `performance.now()` over a fixed seed corpus.
- [P3-AC11] `docs/orchestration.md` is updated in the repository before Phase 3 is considered shipped. Gate-validator confirms the file's `git log` shows a commit in the SPEC-004 branch.

### Rollback

Flip `FEATURE_TASK_PIPELINES` OFF. `advanceTaskChain` becomes a no-op.

### Estimated Work

7–10 engineering days. Evaluator + schema validation + scheduler wiring + template UI.

---

## Phase 4 — `ready_for_owner` State + Two-Step Terminal Event

### Scope

Add `ready_for_owner` to the task state progression for PR-producing tasks (D6, D7). Integrate with existing GitHub sync to transition `ready_for_owner` → `done` only when the linked PR is merged. Non-PR issue workflows continue to use `produces_pr=false` templates and do not require a PR.

### Upstream Impact

`upstream-divergent`. This changes the task-state machine and depends on schema/state upstream does not currently carry.

### Deliverables

- **Kanban UI**: `task-board-panel.tsx` — add `ready_for_owner` column between `quality_review` and `done`. Distinct styling (operator-action-required class).
- **GitHub label**: `github-label-map.ts` — `STATUS_LABEL_MAP.ready_for_owner = 'mc:ready-for-owner'`; `ALL_STATUS_LABEL_NAMES` updated. `initializeLabels` auto-creates the label.
- **Scheduler branching**: `runAegisReviews` — on successful Aegis approval, branch on `workflow_template.produces_pr`:
  - `true` → transition to `ready_for_owner`.
  - `false` → transition to `done` (current behavior).
- **GH sync transition**: `pullFromGitHub` — on linked PR merge, if a `produces_pr=true` task is in `ready_for_owner`, transition to `done`. If the linked issue closes without a merged linked PR, leave the task in `ready_for_owner` and create an operator-visible reconciliation activity/alert. Existing non-PR sync paths remain supported for `produces_pr=false` templates.
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
- [P4-AC4] `produces_pr=true` task in `ready_for_owner` with linked PR merged → `pullFromGitHub` transitions to `done`.
- [P4-AC4a] `produces_pr=true` task in `ready_for_owner` with linked issue closed but no merged linked PR → task remains `ready_for_owner`; reconciliation activity/alert is created.
- [P4-AC4b] `produces_pr=false` close/disposition task can complete without any PR.
- [P4-AC5] Kanban column renders; operator sees tasks awaiting merge in a dedicated lane.
- [P4-AC6] `mc:ready-for-owner` label appears on linked GitHub issue when MC task enters that state.

### Rollback

Flip `FEATURE_TWO_STEP_TERMINAL` OFF. Scheduler transitions direct to `done` as before. `ready_for_owner` column still renders but remains empty.

### Estimated Work

3–4 engineering days.

---

## Phase 5 — Area-Label GitHub Sync

### Scope

Add `area:*` label routing (D8) so that a single monorepo per product line can serve multiple department kanbans. The live sync is currently project-driven, so this phase must also introduce repo-level sync ownership or equivalent dedupe for `(workspace_id, github_repo)`. Behind `FEATURE_AREA_LABEL_ROUTING`.

### Upstream Impact

`upstream-safe`. This is additive sync behavior and a good upstream candidate if implemented generically.

### Deliverables

- **Repo-level sync ownership/dedupe**: ensure only one owner or dedupe path polls a given `(workspace_id, github_repo)` even when multiple department projects share the repo. The unique `(workspace_id, github_repo, github_issue_number)` constraint is a guardrail, not the main routing strategy.
- **Label family**: `github-label-map.ts` — `AREA_LABEL_MAP` and `ALL_AREA_LABEL_NAMES`.
- **Label provisioning**: `initializeLabels` creates the `area:*` labels on sync enable (idempotent).
- **Inbound routing**: `pullFromGitHub` on issue ingestion:
  1. Parse `area:*` labels from issue labels.
  2. If exactly one resolvable area exists, resolve `(workspace_id, area_slug) → project_id` via a lookup (seed a `projects.area_slug` column or use `projects.slug`).
  3. Set `task.project_id = resolved`.
  4. If no `area:*` label, multiple `area:*` labels, or lookup failure, route to the workspace's triage/inbox project with `area:triage` tag and create an activity explaining the ambiguity.
- **Outbound sync**: `pushTaskToGitHub` emits `area:<project_slug>` label alongside `mc:*` and `priority:*`.
- **Template updates**: Pilot workflow templates (Phase 8) emit the correct `area:*` label in their outbound sync paths.

### Files Touched

- `src/lib/github-label-map.ts` — ~15 lines added
- `src/lib/github-sync-engine.ts` — inbound routing (~40 lines), outbound label emission (~10 lines)
- Migration (optional): add `projects.area_slug TEXT NULL` if slug mismatch between MC project and GitHub label is a concern; else reuse `projects.slug`.

### Acceptance Criteria

- [P5-AC1] With flag OFF, GitHub sync behaves as today (one-to-one task↔issue, existing project-driven path).
- [P5-AC2] With flag ON, two or more projects sharing the same `github_repo` do not duplicate-poll or duplicate-ingest the same GitHub issue.
- [P5-AC3] New issues with `area:qa` label are routed to the QA project; `area:dev` to Dev; etc.
- [P5-AC4] Issues with no `area:*` label route to the workspace's triage/inbox project with an `area:triage` tag.
- [P5-AC5] Issues with multiple `area:*` labels route to triage/inbox and create an ambiguity activity; they do not thrash between departments.
- [P5-AC6] Task push to GitHub emits `area:<project_slug>` alongside existing label classes.
- [P5-AC7] `initializeLabels` creates the `area:*` labels on the repo and is idempotent.

### Rollback

Flip `FEATURE_AREA_LABEL_ROUTING` OFF. `pullFromGitHub` ignores `area:*` labels; `pushTaskToGitHub` stops emitting them.

### Estimated Work

3–4 engineering days.

---

## Phase 6 — Disposition Logging + Artifact Store + Admin Panels

### Scope

Log every triage disposition to `task_dispositions` (D9). Add the shared Mission Control task artifact store (D11) as the durable handoff plane between private agent sandboxes. Extend operator surfaces with disposition views and artifact admin/health controls.

### Upstream Impact

`upstream-divergent`. The UI/admin surfaces may be upstreamable, but the current design depends on new persistence tables and artifact semantics upstream does not have.

### Deliverables

- **Insert hook**: in `advanceTaskChain` (Phase 3), after routing resolution, insert a `task_dispositions` row. Fires for every triage template completion regardless of outcome.
- **Artifact publish path**: `src/lib/task-artifacts.ts` imports inline JSON/Markdown or file-backed outputs from an agent sandbox into MC-controlled artifact storage. Writes provenance, hashes, MIME type, preview text, redaction status, scan status, and audit activity.
- **Secret detector contract**: `src/lib/secret-detector.ts` is the single redaction/rejection gate. It exports `detectSecrets(content: string | Buffer, mime: string)` returning `{ findings: SecretFinding[], redacted: string | Buffer }`. The detector ships **MC Secret Detector v1**, a curated rule set sourced from gitleaks v8.x default rules (https://github.com/gitleaks/gitleaks/blob/v8.18.0/config/gitleaks.toml) plus Mission Control additions. Rule families included in v1: AWS access key id (`AKIA[0-9A-Z]{16}`), AWS secret access key (40-char base64-ish heuristic plus AWS context), GitHub PAT (`gh[pousr]_[A-Za-z0-9_]{36,}`), GitHub fine-grained PAT, GitHub OAuth (`gho_…`), Google API key (`AIza[0-9A-Za-z_-]{35}`), Slack token, Stripe key (`sk_live_…`, `pk_live_…`), generic `BEGIN PRIVATE KEY` / `BEGIN RSA PRIVATE KEY` PEM blocks, generic `password=`, `api_key=`, `token=`, `secret=` assignments in `.env`-style lines, JWT (`eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`), generic Bearer header, and Anthropic / OpenAI key patterns (`sk-ant-…`, `sk-…`). The exact regex set is checked into `src/lib/secret-detector.rules.ts` and snapshot-tested with positive/negative fixtures.
- **Redaction policy**: when `detectSecrets` returns ≥1 finding, the artifact publish is REJECTED by default; the producer task gains an `activities` row (kind=`security_violation`) and the publish API returns 422 with the redacted preview. Operator may explicitly opt the workflow template into "redact-and-store" mode (`workflow_templates.allow_redacted_artifacts = 1`, added by M54); in that mode the redacted content is stored and the original is discarded.
- **Secret detector tests** are mandatory: every rule has a positive and negative fixture in `src/lib/__tests__/secret-detector.test.ts`. CI fails if a rule has zero fixtures.
- **Artifact consume path**: successor task dispatch includes artifact references and safe previews. Raw file content is available only through MC-controlled artifact-read APIs.
- **Audit panel**: new tab "Dispositions" in `audit-trail-panel.tsx` with filters on `disposition`, `workspace_id`, date range. Pagination for large result sets.
- **Artifact admin panel**: list/search artifacts, inspect metadata, quarantine unsafe artifacts, delete/archive by policy, repair orphan records, verify hashes, rebuild previews/indexes, and view storage health.
- **Dashboard widget**: simple cards in `dashboard.tsx` showing "Last 7d triage totals" and artifact-store health per workspace.
- **Morning-briefing integration**: daily-ops morning-prep skill can query this table for the daily briefing (separate repo integration — document only, no code here).

### Files Touched

- `src/lib/task-dispatch.ts` — add INSERT in `advanceTaskChain` (~10 lines)
- `src/lib/task-artifacts.ts` — publish/read/quarantine/retention helpers
- `src/app/api/task-artifacts/route.ts` and `src/app/api/task-artifacts/[id]/route.ts` — MC-controlled artifact APIs
- `src/components/panels/audit-trail-panel.tsx` — new tab (~80 lines)
- `src/components/panels/artifact-admin-panel.tsx` — artifact admin/health surface
- `src/components/dashboard/dashboard.tsx` — new widgets (~50 lines)
- `src/app/api/dispositions/route.ts` (new) — GET with filters

### Acceptance Criteria

- [P6-AC1] With flag OFF, no rows inserted into `task_dispositions`.
- [P6-AC2] With flag ON, every triage template completion inserts exactly one row.
- [P6-AC3] Insert failure does not block task advancement (logged to `activities`).
- [P6-AC4] Audit panel renders dispositions with working filters and pagination.
- [P6-AC5] Dashboard widget shows accurate 7-day rollup by disposition.
- [P6-AC6] Agent output can publish inline JSON, Markdown, and file-backed artifacts from a private sandbox into MC artifact storage.
- [P6-AC7] Successor task dispatch includes artifact references and safe previews; no successor reads another agent's private sandbox directly.
- [P6-AC8] Secret-like content in an artifact publish is rejected (or redacted, when the template opts into `allow_redacted_artifacts`) and produces a `security_violation` activity row. Vitest covers every rule family in `secret-detector.rules.ts` with at least one positive fixture (planted secret) and one negative fixture (lookalike that must not match). CI fails on `safe-regex` rejection of any rule. The detector achieves ≥ 95% recall on the curated test fixture set located at `src/lib/__tests__/fixtures/secrets/`.
- [P6-AC9] Artifact admin panel shows counts, bytes, failed publishes/scans/reads, orphan count, storage free space, and p95 publish/read latency. p95 latency is measured server-side over a rolling 1-hour window with at least 100 observations; the Vitest p95 budget is 200 ms for inline artifacts and 1000 ms for ≤ 5 MB file artifacts on the test rig (CI flags slower-than-budget runs as a warning, not a failure, since hardware varies).
- [P6-AC10] Admin actions support quarantine, hash verification, retention/archive/delete by policy, and preview/index rebuild.

### Rollback

Flip `FEATURE_DISPOSITION_LOGGING` and/or `FEATURE_TASK_ARTIFACTS` OFF. INSERT/publish paths become no-ops. Tables remain; queries return empty for new period. Existing artifacts remain readable to preserve auditability unless explicitly archived/deleted by policy.

### Estimated Work

3 engineering days.

---

## Phase 7 — Resource Governance + Cost Tracker Enforcement

### Scope

Extend the existing Cost Tracker from best-effort observability into scheduler-enforced WIP, blackout/degraded-window, and budget governance. This phase must not duplicate token/cost telemetry. It consumes the existing `/api/tokens`, task-cost, provider-subscription, and token-pricing surfaces and adds enforcement decisions around autonomous work.

### Upstream Impact

Mixed:

- Governance core is `upstream-divergent` because the current design depends on `resource_policies` and `resource_policy_events`.
- OpenClaw health electricity / infra cost ingestion is `fork-only optional` and must remain a runtime adapter with no schema migration in v1.

### Deliverables

- **Governance evaluator**: `src/lib/resource-governance.ts` with `evaluateResourceGovernance(context)` returning `allow`, `defer`, `block`, or `override_required`. The evaluator MUST be wrapped in a try/catch at every call site; if `evaluateResourceGovernance` throws, the error path returns `defer` (NOT `block`) so the scheduler retries on the next tick rather than wedging the system; the caught error is written as a `resource_policy_events` row with `decision='defer'`, `reason='evaluator_error: <message>'` and an `activities` row of kind `governance_evaluator_error` is created. A scheduler-wide circuit breaker counts consecutive evaluator errors per minute; on >5 errors/minute the breaker opens and `evaluateResourceGovernance` is bypassed (returns `allow`) until manually reset, with an operator notification of class `governance_circuit_breaker_open`. This combination prevents both silent failure (errors not logged) and full DOS (a buggy evaluator wedging dispatch).
- **Scheduler gates**: call the evaluator before `autoRouteInboxTasks`, `dispatchAssignedTasks`, `advanceTaskChain`, and `runAegisReviews`. The exact call sites in `src/lib/task-dispatch.ts` and `src/lib/scheduler.ts` are documented in the SPEC-008 workflow file.
- **Policy-backed defaults**: preserve current behavior when the flag is OFF; when ON, replace hard-coded `LIMIT 3` and "3+ in-progress tasks" capacity checks with seeded default WIP policies.
- **Cost Tracker UI extension**: add a "Governance" view/tab showing budget utilization, raw token/request/session usage, WIP by scope, active blackout/degraded windows, upcoming windows, policy decisions, and overrides.
- **Budget semantics**: separate `estimated_marginal_cost_usd` from raw usage budgets. the OpenClaw node's OpenAI ChatGPT Pro setup may show `$0` estimated marginal cost, but token/request/session/WIP budgets still enforce.
- **Electricity / infra ingestion**: behind `FEATURE_OPENCLAW_HEALTH_COSTS`, read OpenClaw health artifacts (`~/.openclaw/health/readings.jsonl`, `current-rate.json`, `cost.json`) into a facility-cost model exposed through the Cost Tracker API/UI.
- **Blended cost semantics**: keep token/API cost and electricity/infra cost distinct, but expose combined totals for budgeting and operator visibility.
- **Adapter discipline**: OpenClaw health cost support remains runtime-only in v1. No schema migration. If the files/config are absent, the adapter returns empty data and Cost Tracker / scheduler continue normally.
- **Policy audit**: write every non-allow decision to `resource_policy_events` and emit activity/notification records for operator visibility.
- **Override path**: operator can temporarily override a policy decision with reason, actor, scope, and expiry recorded.

### Files Touched

- `src/lib/resource-governance.ts` (new)
- `src/lib/task-dispatch.ts` — evaluator calls before routing, dispatch, chain advancement, and Aegis review
- `src/app/api/resource-policies/route.ts` and `src/app/api/resource-policy-events/route.ts` (new)
- `src/app/api/tokens/route.ts` — expose governance summary data or reuse existing aggregates
- `src/lib/openclaw-health-costs.ts` (new) — read/normalize electricity rate, power, energy, and cost snapshots from OpenClaw health files
- `src/components/panels/cost-tracker-panel.tsx` — governance tab/view
- `src/components/panels/task-board-panel.tsx` — WIP-limit indicators on columns where useful

### Acceptance Criteria

- [P7-AC1] With `FEATURE_RESOURCE_GOVERNANCE=false`, existing scheduler behavior is unchanged.
- [P7-AC2] With the flag ON and no policies enabled, evaluator returns `allow` and logs no blocking events.
- [P7-AC3] Agent WIP policy `agent_id=a, limit_kind='in_progress_tasks', limit_value=1` prevents a second task from dispatching to that agent and writes a `defer` or `block` event.
- [P7-AC4] Project/status WIP policy prevents more than the configured number of Product Line A Development tasks from entering `in_progress`.
- [P7-AC5] Blackout window policy blocks new autonomous dispatch/chain advancement during the window while allowing already-running work to checkpoint or complete.
- [P7-AC6] Degraded window policy allows only configured critical/local/approved-provider work.
- [P7-AC7] Soft budget threshold emits alert/activity and allows work to continue.
- [P7-AC8] Hard budget threshold blocks or pauses new work according to policy enforcement and requires operator override to continue.
- [P7-AC9] OpenAI subscription path still enforces token/request/session budgets even when estimated marginal USD cost is zero.
- [P7-AC10] With `FEATURE_OPENCLAW_HEALTH_COSTS=false` or with OpenClaw health files absent, existing Cost Tracker and scheduler behavior are unchanged.
- [P7-AC11] With `FEATURE_OPENCLAW_HEALTH_COSTS=true` and valid OpenClaw health files present, facility electricity/infra telemetry appears in Cost Tracker alongside token/API cost, with blended totals available.
- [P7-AC12] Policy evaluation failure fails safe: a thrown error inside `evaluateResourceGovernance` causes the call site to return `defer`; a `resource_policy_events` row with `reason='evaluator_error: …'` is written; an `activities` row of kind `governance_evaluator_error` is written; an operator notification fires. >5 consecutive errors/minute trip the circuit breaker, after which evaluator returns `allow` until reset (with operator alert). Validated by Vitest with a `evaluateResourceGovernance` stub that throws; assertions cover the activity row, the policy event, the notification, and the breaker state transition.

### Rollback

Flip `FEATURE_RESOURCE_GOVERNANCE` OFF. Scheduler returns to legacy behavior. Tables and events remain for auditability. Existing Cost Tracker views continue to work. If needed, also flip `FEATURE_OPENCLAW_HEALTH_COSTS` OFF to remove the fork-only OpenClaw infra adapter without affecting governance core.

### Estimated Work

4–6 engineering days.

---

## Phase 8 — Product Line A Pilot (End-to-End Smoke)

### Scope

Activate every Phase 1–7 feature flag, seed Product Line A workspace + templates + project-agent assignments, set conservative governance policies, and run the pilot on Product Line A issue #110 (the canonical pilot trigger — the historical smoke plan lives in the operator's Obsidian vault and is not required to be present in this repo for autopilot execution; the synthetic-fallback path documented above ensures Phase 8 is reproducible without it).

### Deliverables

- **Seed script**: `scripts/seed-product-line-a-workspace.ts`:
  - Ensure `facility` workspace exists (idempotent, using `workspaces.name`).
  - Create Product Line A workspace (`slug='product-line-a'`, `name='Product Line A'`).
  - Create per-department projects (QA, Development, DevSecOps, Marketing, Customer Service, Finance).
  - Seed product-surface/component metadata or labels (macOS App, Website, Documentation, UI, integrations, licensing/billing, onboarding) without creating separate department projects for them.
  - Populate `project_agent_assignments` mapping roles to the six `product-line-a-platform-*` agents.
  - Insert the Product Line A workflow-family records into `workflow_templates`, including slugs and task-chain routing fields.
  - Set the Product Line A department projects' GitHub repo to `<org>/product-line-a-repo` (or canonical repo) while preserving repo-level sync ownership/dedupe.
  - Migrate existing synced Product Line A GitHub issue tasks as unprocessed intake into Product Line A triage/intake while preserving GitHub linkage and sync metadata.
- **Flag activation**: enable all Phase 1–7 flags in the product-line scope.
- **Governance seed**: enable conservative Product Line A defaults (for example one active dev task per dev agent, WIP cap per department column, no autonomous work during configured blackout windows, and token/request/session budgets even for subscribed providers).
- **Pilot trigger**: label Product Line A issue #110 with `mc:inbox` + `priority:*` + `area:dev` (or appropriate area). If issue #110 is unavailable (closed, deleted, mutated beyond recognition), the seed script falls back to creating a synthetic issue titled `[mc-pilot] synthetic e2e issue` with the same labels in the Product Line A repo. Verify:
  - MC ingests it via `pullFromGitHub`.
  - Routes to Product Line A › Dev project.
  - Triage template runs → researcher agent produces structured output.
  - Scheduler advances chain → plan → dev → review → Aegis → ready_for_owner.
  - Pilot HUMAN GATE `G_PILOT_MERGE`: operator merges PR on GitHub → task → `done` via `pullFromGitHub`. Autopilot stops at `ready_for_owner` and awaits operator action; this is the only intentional human-in-the-loop checkpoint in the otherwise-autonomous workflow.
- **Pilot smoke checklist**: `docs/qa/pilot-smoke-checklist.md` enumerates the manual verification steps an operator performs after autopilot completes the autonomous portion: confirm wall-clock target met, confirm audit trail present, confirm governance compliance, record any anomalies. Manual ACs are validated only via this checklist.
- **Second smoke**: repeat with issue #111 (or a second synthetic) as stronger integration.

### Acceptance Criteria

Code-checkable (validated by `gate-validator` and `implement-executor` TDD):

- [P8-AC2] `task_dispositions` contains the triage record with correct disposition. Validated by SQL: `SELECT COUNT(*) FROM task_dispositions WHERE task_id = :pilot_task_id` ≥ 1; `disposition` value matches expected per template.
- [P8-AC3] Every stage's task has correct `assigned_to` resolved from `project_agent_assignments`. Validated by walking the chain via `parent_task_id` and asserting each row's `assigned_to` matches `project_agent_assignments.agent_name` for the template's `agent_role`.
- [P8-AC4] Aegis approves the dev task and transitions it to `ready_for_owner`. Validated by `SELECT status FROM tasks WHERE id = :dev_task_id` returning `ready_for_owner` and `quality_reviews.status = 'approved'`.
- [P8-AC5] PR merge triggers `ready_for_owner → done` via `pullFromGitHub`. Validated by injecting a webhook fixture (closed PR + merged=true) into `pullFromGitHub` and asserting the task transitions to `done`.
- [P8-AC8] Resource governance events show no policy violations during the pilot. Validated by `SELECT COUNT(*) FROM resource_policy_events WHERE decision IN ('block', 'override_required') AND task_id IN (chain task IDs)` = 0.

Manual (recorded in `docs/qa/pilot-smoke-checklist.md`; NOT validated by `gate-validator`):

- [P8-AC1 — MANUAL] Issue #110 (or synthetic fallback) completes end-to-end with operator intervention only at `G_PILOT_MERGE`.
- [P8-AC6 — MANUAL] Total wall-clock time from issue label to PR-merge-notification is < 4 hours for a simple issue.
- [P8-AC7 — MANUAL] Audit trail shows every stage transition (visual inspection of `audit-trail-panel.tsx` after pilot run; an automated check covers row count but not human-readable correctness).

### Rollback

Per-flag rollback. Worst case: flip `PILOT_PRODUCT_LINE_A_E2E` and `FEATURE_RESOURCE_GOVERNANCE` OFF and revert to explicit operator assignment (Pattern 1 from the Mission Control orchestration patterns reference; see `docs/orchestration.md`).

### Estimated Work

4–5 engineering days (seed + activation + two real smoke runs + remediation of surprises).

---

## Phase 9 — Product Line B Onboarding (Scale Validation)

### Scope

Onboard Product Line B platform as the second product line. Validate that the architecture scales — < 1 operator-hour from zero to running.

### Deliverables

- **Seed script parameterization**: `scripts/seed-product-line.ts product_line_slug agent_prefix github_repo`. Generalize the Product Line A seed.
- **Agent roster**: spin up `product-line-b-platform-*-dev`, `-ui`, `-qa`, `-devsecops`, `-planner`, `-research` sandboxes (six new docker containers).
- **Template family**: adapt Product Line A templates to Product Line B (likely near-identical; only `agent_role` mappings and repo URL change).
- **GitHub repo**: set `ProductLineB workspace.github_repo = '<org>/product-line-b-repo'` (or canonical repo).
- **First smoke**: a real Product Line B issue flows through the pipeline.

### Acceptance Criteria

Code-checkable:

- [P9-AC2] Product Line B's agents are strictly isolated from Product Line A's. Validated by SQL: zero rows in `project_agent_assignments` join across the two workspace_ids share an `agent_name` unless that agent has `agents.scope='global'`.
- [P9-AC3] Facility agents (Aegis, Security Guardian) serve both product lines without code change. Validated by running the Product Line A pilot's automated subset (P8 code-checkable ACs) against a Product Line B synthetic issue and asserting Aegis approval succeeds with the same `agents.id`.
- [P9-AC4] Dashboard disposition widget shows metrics per-workspace. Validated by HTTP assertion against `/api/dispositions?workspace_id=<id>` returning workspace-scoped rows.

Manual (recorded in `docs/qa/pilot-smoke-checklist.md`):

- [P9-AC1 — MANUAL] End-to-end onboarding (seed + agent provision + first task) completes in < 1 operator-hour. Operator records start/end timestamps in the checklist.

### Rollback

Disable Product Line B workspace (set `disabled_at`). Product Line A unaffected.

### Estimated Work

2–3 engineering days.

---

## Dependency Graph

```
Phase 0 (migrations)
    └─→ Phase 1 (switcher + shared feature-flag resolver)
          ├─→ Phase 2 (Aegis refactor)
          │     └─→ Phase 3 (pipeline engine) ── depends on Phase 2 for global Aegis scheduler hooks
          │           ├─→ Phase 4 (ready_for_owner + two-step) ── depends on Phase 3 for produces_pr template field
          │           ├─→ Phase 6 (disposition logging + artifact store) ── depends on Phase 3 for advanceTaskChain hook
          │           └─→ Phase 7 (resource governance) ── depends on Phase 3 for scheduler chain hook
          ├─→ Phase 5 (area labels) ── depends on Phase 1 for workspace scoping
          └─→ Phase 8 (Product Line A pilot) ── depends on ALL of Phase 1–7
             └─→ Phase 9 (Product Line B onboarding)
```

Phase 0 MUST land first. Phase 1 MUST land before any later feature-flagged spec because it owns `resolveFlag()`. After Phase 1, Phase 2 and Phase 5 may proceed independently; Phase 3 waits for Phase 2 and gates 4, 6, and 7. Phase 8 gates 9.

Phase 3 also gates the repository documentation refresh for `docs/orchestration.md`; Phase 3 is not shipped until that documentation describes declarative task chains and current lifecycle/status terminology.

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
| 7 | 5 | 35.5 |
| 8 | 4.5 | 40 |
| 9 | 2.5 | 42.5 |

~8–9 engineering weeks end-to-end for a single engineer working full-time. Multi-engineer parallelism after Phase 1 (Phase 2 + Phase 5, with Phase 3+ queued behind Phase 2) compresses to ~6–7 weeks.

## Risk Register (linked to PRD §8)

| # | Phase Impacted | Mitigation Owner |
|---|---|---|
| R1 Aegis refactor surface area | Phase 2 | Dedicated phase + comprehensive tests pre-ship |
| R2 Cross-product MEMORY.md bleed | Phase 3, 8, 9 | D4a strict-twin enforced; no global promotion without review |
| R3 Routing-rule expression safety | Phase 3 | FR-D8 safe-subset; evaluator tests include adversarial inputs |
| R4 Schema validation false-positives | Phase 3, 8 | Version `output_schema`; agent prompts reference version |
| R5 GitHub label drift | Phase 5 | `initializeLabels` idempotent; `area:triage` fallback |
| R6 Cross-tab state desync | Phase 1 | No existing pattern in `src/store/index.ts`; Phase 1 implements `persist` + `BroadcastChannel` from scratch for the `activeWorkspace` slice only |
| R7 Disposition/artifact store growth | Phase 6 | Quotas, retention, artifact admin maintenance, and revisit partitioning/storage tiering at scale |
| R8 Feature-flag sprawl | All | Flags default OFF; document in settings-panel |
| R9 Budget/capacity policy misconfiguration | Phase 7 | Conservative defaults, dry-run mode, audit events, and explicit operator override path |

## Rollback Strategy Summary

Each phase is independently rollback-safe:

- **Schema migrations** (Phase 0) — manual reverse SQL files at `docs/migrations/rollback-M53.sql` through `docs/migrations/rollback-M61.sql` plus an operator runbook at `docs/migrations/rollback-procedure.md`. The live migration runner (`src/lib/migrations.ts:5-9`) has no `down()` function; rollback is operator-initiated manual SQL, NOT automatic.
- **Feature flags** (Phases 1–7) — flip OFF (via `workspaces.feature_flags` JSON or the env-var kill-switch documented in the Feature Flag Resolution Policy) → behavior reverts to pre-phase.
- **Pilot** (Phase 8) — flip `PILOT_PRODUCT_LINE_A_E2E` OFF; workspace remains, templates remain, but the auto-chain stops; operator can fall back to explicit task assignment (Pattern 1).
- **Product-line onboarding** (Phase 9) — `workspace.disabled_at = NOW()`; sync pauses; agents still run but no new work dispatched.

No destructive rollback required at any phase.

## Upstream Compat Checklist (every PR)

- [ ] Does this PR reference `task_templates` as a SQL table? If yes, STOP — live table is `workflow_templates`.
- [ ] Does this PR insert into `workspaces.display_name`? If yes, STOP — live column is `workspaces.name`.
- [ ] Does this PR assume `agents.workspace_path` or a `tasks.status` CHECK constraint exists? If yes, first verify the live `.schema` and document the result.
- [ ] Does this PR rename any column in `workspaces`, `projects`, `tasks`, or `agents`? If yes, STOP unless a compatibility/rollback decision is recorded — DB renames are upstream-divergent and not automatically additive-safe.
- [ ] Does this PR modify any upstream-owned file (`src/app/layout.tsx`, `src/lib/auth.ts`, etc.) in a way that would create merge conflicts? If yes, isolate the change to a new file or extend via hooks.
- [ ] Does this PR add new migrations? If yes, they MUST be additive.
- [ ] Does this PR change public API shapes (existing endpoints)? If yes, version the endpoint or preserve the old shape.
- [ ] Feature flag present?

Every phase PR passes through this checklist before merge.
