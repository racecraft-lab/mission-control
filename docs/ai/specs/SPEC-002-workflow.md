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

Do not start downstream specs from this worktree. SPEC-002 stops after the feature-flagged Product Line switcher, Facility/Product Line scope state, explicit REST/SSE scoping, header terminology fix, state/cache/URL transition contract, verification, and roadmap bookkeeping are complete.

---

## Workflow Overview

| Phase | Command | Status | Notes |
|-------|---------|--------|-------|
| Specify | `$speckit-specify` | Complete | Generated `specs/002-product-line-switcher/spec.md`; G1 passed with 0 markers; Clarify still required to encode fixed workflow decisions |
| Clarify | `$speckit-clarify` | Complete | Encoded state/scoping/API/SSE/UI edge cases; G2 passed with 0 markers |
| Plan | `$speckit-plan` | Complete | Generated plan, research, data model, contracts, and quickstart; G3 passed |
| Checklist | `$speckit-checklist` | Complete | State-management, api-contracts, ux, and regression-safety checklists passed; G4 passed |
| Tasks | `$speckit-tasks` | Complete | Generated 50 dependency-ordered tasks across 8 phases; G5 passed |
| Analyze | `$speckit-analyze` | Complete | Remediated 6 findings; A1/A2 consensus completed; G6 passed |
| Implement | `$speckit-implement` | Complete | G7 passed: all generated tasks are checked, acceptance evidence is complete, and full repo verification passed |

**Status Legend:** Pending | In Progress | Complete | Blocked

### Open File Hygiene

Applies to every remaining Checklist, Tasks, Analyze, Implement, and Post step:

- Use bounded `rg`/targeted file reads instead of broad repo scans unless the step explicitly requires discovery.
- Do not leave subagents, dev servers, Playwright servers, MCP helper processes, or long-running shell sessions open after a step returns.
- If a step starts helper processes, close them before returning and report anything that could not be closed.
- Before each remaining phase handoff, the orchestrator checks for duplicate direct child helpers under the active Codex process and closes stale duplicates before starting the next subagent.
- If `Too many open files` appears, pause the phase, close the active subagent, clean stale helpers, then restart the phase from the latest generated artifact state.

### Phase Gates

| Gate | Checkpoint | Approval Criteria |
|------|------------|-------------------|
| G1 | After Specify | Requirements describe Product Line selection, Facility aggregate, feature flag behavior, scopeKey/cache/URL behavior, deferred boundaries, and no unresolved `[NEEDS CLARIFICATION]` markers remain |
| G2 | After Clarify | `activeTenant` vs Product Line scope, Facility/null compatibility semantics, API authorization, URL ownership, cache isolation, and cross-tab persistence decisions match this workflow |
| G3 | After Plan | Constitution gates pass; feature flag resolution, REST/SSE scoping, UI integration, state/cache/URL transition behavior, and test strategy are concrete |
| G4 | After Checklist | All state-management, api-contracts, ux, and regression-safety gaps are resolved |
| G5 | After Tasks | P1-AC1 through P1-AC16 have task coverage and tasks are dependency-ordered |
| G6 | After Analyze | No CRITICAL/HIGH findings; tasks do not drift into SPEC-003+ behavior |
| G7 | After Implement | Flag-off regression checks, flag-on scoping tests, UI/accessibility checks, scopeKey/cache/URL tests, Playwright cross-tab check, and docs status pass |

---

## Prerequisites

### Constitution Validation

Before starting any phase, verify alignment with `.specify/memory/constitution.md` and the current roadmap.

| Principle | Requirement | Verification |
|-----------|-------------|--------------|
| Zero-regression contract | With `FEATURE_WORKSPACE_SWITCHER=0`, existing single-workspace behavior and snapshots remain unchanged | `pnpm test:all` with flag OFF, or documented focused fallback if sandbox restrictions block full e2e |
| Feature-flag resolution discipline | New runtime behavior routes through `resolveFlag(name, ctx)` in `src/lib/feature-flags.ts`; inline `process.env.FEATURE_*` checks are forbidden | Grep runtime code for inline feature flag reads and cover `resolveFlag()` behavior with tests |
| Upstream compatibility discipline | SPEC-002 is `upstream-safe`; additions are opt-in and avoid destructive schema/runtime divergence | No SQL renames, no destructive migration, no unnecessary upstream-owned conflict surface |
| Test-first development | Production code changes follow red-green-refactor | Failing Vitest or Playwright tests are added before implementation for state, API, SSE, and UI behavior |
| Strict scope ramp | New production modules in strict scope are limited to `workspace-switcher.tsx`, `product-line.ts`, and `feature-flags.ts` unless the plan justifies more; required existing-file edits are allowed only for Phase 1 scope behavior | Plan and tasks list every new TS/TSX production module, update `tsconfig.spec-strict.json` and `eslint.config.mjs` for those modules, and keep unrelated cleanup out |
| Package manager | Use pnpm for repo verification | Lockfile is `pnpm-lock.yaml`; use `pnpm` commands only |

**Constitution Check:** Verified on 2026-04-26 before Phase 1. Baseline checks: `pnpm typecheck` passed; `pnpm lint` passed with pre-existing warnings only; `pnpm test` passed outside sandbox with 996 tests after sandbox-only GPG/socket failures; `pnpm build` passed outside sandbox after sandbox-only Google Fonts network failure; `pnpm test:e2e` passed outside sandbox with 514 tests after sandbox-only localhost bind failure. SPEC-001 is complete and SPEC-002 is the first runtime feature-flag spec.

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
| Tool metadata | `tools: []` |
| Strict Scope | New production modules are limited to `src/components/layout/workspace-switcher.tsx`, `src/types/product-line.ts`, and `src/lib/feature-flags.ts`; existing store, header, panel, API, SSE, message, and strict-scope config files may be touched only for documented Phase 1 behavior |
| Status Authority | Roadmap + this workflow are execution-status authority; PRD phase tables are durable summary notes only |
| Source PRD | `docs/rc-factory-v1-prd.md` |
| Source Roadmap | `docs/ai/rc-factory-technical-roadmap.md` |

### Scope Summary

Implement the RC Factory Phase 1 Product Line switcher:

- Add feature-flagged `FEATURE_WORKSPACE_SWITCHER` behavior through `resolveFlag(name, ctx)`.
- Resolve switcher chrome from the authenticated tenant/facility flag context returned with `/api/workspaces`, not from selected `activeWorkspace`; flag-ON Facility tests must seed `workspaces.feature_flags`, not rely on env `1`.
- Add independent Facility/Product Line scope state backed by `activeWorkspace: Workspace | null` for compatibility.
- Export `setActiveProductLine(productLine | null, options)` as the single transition API for switcher, URL, hydration, and BroadcastChannel changes.
- Keep `activeTenant` as tenant/facility context; switching Product Lines must not mutate tenant state.
- Add `src/components/layout/workspace-switcher.tsx` and integrate it into `header-bar.tsx`.
- Stop labeling tenant context as "Workspace" in the header.
- Treat the switcher's synthetic "Facility" option as Facility aggregate scope (`activeWorkspace = null` compatibility state), not direct selection of the real `workspaces.slug='facility'` row.
- Persist Product Line scope with Zustand `persist` under key `mc:active-workspace:v1`.
- Add guarded `BroadcastChannel('mc:active-workspace')` cross-tab synchronization, with graceful fallback when unavailable.
- Add `src/types/product-line.ts` with `type ProductLine = Workspace`.
- Add explicit REST scoping: `workspace_id=<id>` for Product Line, `workspace_scope=facility` for Facility, both params return `400`, unauthorized ids return `403`, the real `workspaces.slug='facility'` row is rejected as a Product Line `workspace_id`, and omitted scope is legacy-only with the flag OFF.
- Add SSE scoping for `/api/events` with authorized Product Line and Facility aggregate modes, including EventSource reconnect when Facility/Product Line scope changes.
- Add `scopeKey = tenantId + ":" + ("facility" | productLineId)` cache/request ownership, URL scope ownership, stale in-flight response rejection, and scoped state invalidation that clears incompatible `activeProject`, selected task/agent/project/conversation state, scoped modals, filters, and drafts unless explicitly keyed by `scopeKey`.
- Wire mode-sensitive panels to scope and keep skills/local sessions/transcripts Facility/global only.

### Success Criteria Summary

- [x] P1-AC1: With flag OFF, existing `pnpm test:all` passes unchanged from the pre-Phase-1 baseline.
- [x] P1-AC2: With flag ON and Facility scope selected, existing tests remain unchanged while new tests assert Facility aggregate semantics.
- [x] P1-AC3: The switcher renders exactly one synthetic Facility option; selecting it stores Facility scope (`activeWorkspace = null` compatibility state), never selects the real `facility` workspace row, and server-side scope parsing rejects that row as Product Line `workspace_id`.
- [x] P1-AC4: With flag ON and selected Product Line scope, mode-sensitive panels show only that Product Line's authorized data plus allowed global agents; Facility/global surfaces remain Facility aggregate.
- [x] P1-AC5: Agent squad renders Facility globals -> Product Line A -> departments -> agents; duplicate global/local names do not merge stats and ambiguous mutations use ids.
- [x] P1-AC6: Cross-tab state sync works within 1s via BroadcastChannel, with tenant/session guards, stale-version protection, and reload fallback when BroadcastChannel is unavailable.
- [x] P1-AC7: `activeTenant` remains independent from Product Line scope.
- [x] P1-AC8: `header-bar.tsx` no longer uses "Workspace" as the tenant-context label.
- [x] P1-AC9: Mode-sensitive REST routes implement `workspace_id`, `workspace_scope=facility`, both-params `400`, unauthorized `403`, facility-row-as-product-line `400`, and omitted-scope legacy-only behavior.
- [x] P1-AC10: `/api/events` returns authorized Product Line-filtered events and authorized Facility aggregate events; scoped events include `workspace_id`; selected clients drop missing/mismatched workspace events; EventSource reconnects on scope change.
- [x] P1-AC11: `src/store/index.ts` exports Product Line scope persistence and guarded BroadcastChannel tests.
- [x] P1-AC12: Facility/Product Line/tenant terminology is consistent and SPEC-002 does not introduce multi-facility tenant modeling.
- [x] P1-AC13: Header switcher is responsive and accessible at 320/375/390 px with long-name truncation, preserved header controls, localized labels, non-focusable loading/empty/error states, listbox semantics, and trigger focus return.
- [x] P1-AC14: Mode-sensitive fetch/cache keys include `scopeKey`; transitions ignore stale in-flight responses and scoped mutation completions.
- [x] P1-AC15: URL state is scope-owned and invalid/unowned entity params are stripped rather than resolved against stale persisted state.
- [x] P1-AC16: Deferred boundaries are enforced for skills, local/gateway sessions/transcripts, SC-15/V2 gateway readiness, and multi-facility tenant modeling.

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
- Department lead: needs product-line-scoped task, agent, project, quality-review, and DB chat surfaces.
- Existing single-workspace user: needs current behavior preserved when the feature flag is OFF.
- Downstream spec executor: needs `resolveFlag()` and `activeWorkspace` established before SPEC-003 through SPEC-009.

### User Stories

- US1: As an existing user, I can run Mission Control with `FEATURE_WORKSPACE_SWITCHER=0` and observe no behavior or snapshot changes.
- US2: As a facility operator, I can select Facility and see the authorized aggregate view while global agents remain visible.
- US3: As a department or product-line operator, I can select a Product Line workspace and see scoped tasks, agents, projects, quality-review, and DB chat data for that Product Line.
- US4: As a multi-tab operator, I can switch product-line context in one tab and see other tabs update or reload into the same selection.
- US5: As a security-conscious tenant admin, I cannot request another tenant's workspace data through REST or SSE scoping parameters.

### Functional Requirements

- Add `src/lib/feature-flags.ts` exporting `resolveFlag(name, ctx)` per the roadmap Feature Flag Resolution Policy.
- Add `FEATURE_WORKSPACE_SWITCHER` with hard-default OFF.
- Read per-workspace overrides from `workspaces.feature_flags JSON`; `NULL` means all runtime flags are OFF.
- Treat `process.env.FEATURE_WORKSPACE_SWITCHER === '0'` as an emergency OFF kill-switch only; do not force ON from env.
- Preserve the roadmap exception: `PILOT_PRODUCT_LINE_A_E2E=1` is the only env-force-ON flag; all normal `FEATURE_*` flags require JSON opt-in and `FEATURE_*=1` tests must prove no forced ON behavior.
- Resolve `FEATURE_WORKSPACE_SWITCHER` for the switcher chrome from the authenticated tenant/facility flag context returned with `/api/workspaces`; selected Facility scope (`activeWorkspace = null`) is not passed as a no-workspace resolver context for this flag.
- Add a typed Product Line scope slice backed by `activeWorkspace: Workspace | null` compatibility state independent from `activeTenant`.
- Export and use `setActiveProductLine(productLine | null, options)` as the only public transition path; it backs user selection, persisted hydrate, URL scope adoption, invalid-scope reset, and BroadcastChannel acceptance.
- Persist Product Line scope to localStorage key `mc:active-workspace:v1`.
- Add BroadcastChannel synchronization using `BroadcastChannel('mc:active-workspace')` messages shaped as `{ tenantId, userId/sessionId, productLineId|null, version, originTabId }`, with no-op fallback when unavailable.
- Add `src/components/layout/workspace-switcher.tsx` and integrate it into `src/components/layout/header-bar.tsx`.
- Header tenant/facility context must no longer be labeled "Workspace."
- The switcher must list exactly one synthetic Facility aggregate entry plus authorized non-Facility Product Line workspaces.
- The Facility entry must not select the real `workspaces.slug='facility'` row and a real workspace named/slugged `facility` must not create a duplicate aggregate option; server-side scope parsing also rejects the real `facility` row when passed as Product Line `workspace_id`.
- Runtime scope is discriminated: `scope.kind = "facility"` or `scope.kind = "productLine"`; `activeWorkspace = null` may only mean Facility after auth/workspace initialization.
- Scope transitions clear incompatible `activeProject`, selected task/agent/project/conversation state, scoped modals, filters, and drafts unless those values are explicitly keyed by the new `scopeKey`.
- Mode-sensitive panels pass explicit scope and use `scopeKey = tenantId + ":" + ("facility" | productLineId)` for request/cache ownership.
- Facility/global surfaces render Facility aggregate data and do not become Product Line-owned.
- Relevant REST endpoints implement `workspace_id=<id>` for Product Line, `workspace_scope=facility` for Facility, both-params `400`, unauthorized `403`, facility-row-as-product-line `400`, and omitted-scope legacy-only behavior.
- `/api/events` supports authorized Product Line filtering and authorized Facility aggregate mode; workspace-scoped events must include `workspace_id`, selected clients drop missing/mismatched scoped events, EventSource reconnects on Facility/Product Line scope changes, and only whitelisted global events may omit workspace scope.
- Global agents with `scope='global'` appear across all Product Line views; duplicate global/local names require id-based mutation semantics.
- Skills remain Facility/global only; SPEC-002 adds no product-line skill ownership, assignment, permissioning, CRUD, or visibility filters.
- Local/gateway sessions and transcripts remain Facility/global; SPEC-002 adds no session-to-workspace transcript mapping.

### Constraints

- Preserve existing behavior with the flag OFF.
- Keep `activeTenant` independent from `activeWorkspace`; never reuse tenant context as product-line context.
- Scope new production modules to `src/components/layout/workspace-switcher.tsx`, `src/types/product-line.ts`, and `src/lib/feature-flags.ts` unless the plan proves another module is necessary.
- Do not implement SPEC-003 Aegis refactor, SPEC-004 task pipeline behavior, SPEC-005 `ready_for_owner`, SPEC-006 area-label routing, SPEC-007 artifact/disposition behavior, or SPEC-008 governance enforcement.
- Use pnpm for verification.
- Preserve V2 gateway readiness: if SPEC-002 touches gateway-facing code, it must not add direct `OPENCLAW_GATEWAY_*`, `config.gatewayHost`, `config.gatewayPort`, or `gateways.is_primary` assumptions outside an approved resolver/adapter with a V2-001 reference.

### Out of Scope

- Aegis global singleton behavior beyond rendering already-global agents.
- Task-chain runtime engine, routing rules, schema validation, and successor task creation.
- `ready_for_owner` task state, Kanban lane, GitHub labels, notifications, and PR-merge transition.
- Area-label GitHub sync and repo-level dedupe.
- Disposition logging, artifact store APIs, artifact admin UI, and resource governance.
- Product Line A pilot seeding and Product Line B onboarding.
- Product-line skill ownership, skill filtering, skill assignment, skill permissioning, and skill CRUD.
- Session-to-workspace transcript mapping for local/gateway sessions and transcripts.
- Multi-facility tenant modeling; SPEC-002 treats authenticated tenant as the Facility aggregate boundary.
```

### Specify Results

| Metric | Value |
|--------|-------|
| Functional Requirements | 12 generated initially; Clarify must expand to fixed Phase 1 decisions |
| User Stories | 4 generated initially; Clarify must preserve security-conscious tenant admin coverage in scope decisions |
| Acceptance Criteria | 16 P1 criteria from roadmap |

### Files Generated

- [x] `specs/002-product-line-switcher/spec.md`

### Traceability Markers

Use these stable references in the generated spec and later tasks:

| Marker | Purpose |
|--------|---------|
| US1 | Flag-off zero regression |
| US2 | Facility aggregate/null workspace behavior |
| US3 | Selected product-line filtered behavior |
| US4 | Cross-tab persistence and synchronization |
| US5 | Authorized REST/SSE scoping |
| SC-3 | Switcher fidelity and Facility/Product Line operating modes |
| SC-14 | Product-line request scoping |
| SC-15 / V2-001 | Tenant-aware gateway readiness guard |
| SC-16 | Facility/Product Line transition lifecycle |
| P1-AC1..P1-AC16 | Roadmap acceptance criteria |
| FR-FLAG | Feature-flag resolution requirements |
| FR-STATE | Zustand Product Line scope, cache, URL, and cross-tab requirements |
| FR-SCOPE | REST/SSE authorization and scoping requirements |
| FR-DEFERRED | Skills, session/transcript, and multi-facility non-goals |

---

## Phase 2: Clarify

**When to run:** After Specify if generated artifacts introduce ambiguity or drift. The decisions below are already made; Clarify must encode them, not reopen them.

### Clarify Prompts

#### Session 1: Product-Line State and Facility Semantics

```bash
$speckit-clarify

Encode these SPEC-002 state decisions if the generated spec is missing them:
- Facility is the canonical user-facing aggregate; tenant is the current auth/data boundary for that Facility.
- Runtime scope is discriminated as Facility or Product Line even if `activeWorkspace = null` is the compatibility storage representation.
- `setActiveProductLine(productLine | null, options)` is the required transition API for every Facility/Product Line change.
- The switcher renders exactly one synthetic Facility option and suppresses any real `workspaces.slug='facility'` row from aggregate selection.
- The real `workspaces.slug='facility'` row is invalid as a Product Line `workspace_id` in REST, URL scope, and SSE setup; Facility aggregate must use `workspace_scope=facility`.
- Global agents appear across Product Line views; duplicate global/local names require id-based mutation semantics.
- First load starts in Facility only after auth/workspace initialization; stale persisted Product Line ids are validated or cleared before scoped data renders.
- Scope transitions clear incompatible `activeProject`, selected task/agent/project/conversation state, scoped modals, filters, and drafts unless they are keyed by `scopeKey`.
- `FEATURE_WORKSPACE_SWITCHER` bootstrap uses authenticated tenant/facility flag context from `/api/workspaces`; selected Facility (`activeWorkspace = null`) is not treated as a no-workspace flag context.
```

#### Session 2: REST and SSE Authorization

```bash
$speckit-clarify

Encode these SPEC-002 API and event decisions if the generated spec is missing them:
- Product Line requests use `workspace_id=<id>`; Facility requests use `workspace_scope=facility`.
- Requests sending both params return `400`; unauthorized workspace ids return `403`; the real `facility` workspace row sent as `workspace_id` returns `400`; omitted scope is legacy-only when the feature flag is OFF.
- The route matrix includes task routes (`/api/tasks`, `/api/tasks/[id]`, `/api/tasks/[id]/comments`, `/api/tasks/[id]/broadcast`, `/api/tasks/[id]/branch`, `/api/tasks/queue`, `/api/tasks/outcomes`, `/api/tasks/regression`), project routes (`/api/projects`, `/api/projects/[id]`, `/api/projects/[id]/agents`, `/api/projects/[id]/tasks`), agent root/detail/subroutes, quality-review, DB chat message/conversation routes, `/api/search`, `/api/activities`, `/api/notifications`, dashboard/status/audit/live-feed backing routes, `/api/system-monitor`, and `/api/events`.
- Routes either accept explicit scope or authorize by resource id joined back to tenant/workspace.
- `/api/events` requires `workspace_id` on workspace-scoped events, drops missing/mismatched events for selected Product Line clients, reconnects EventSource when Facility/Product Line scope changes, and only allows explicitly whitelisted global events without workspace scope.
```

#### Session 3: UI, Persistence, and Regression Boundaries

```bash
$speckit-clarify

Encode these SPEC-002 UI and test decisions if the generated spec is missing them:
- Header tenant/facility context is not labeled "Workspace."
- Desktop switcher is in the left header context cluster; mobile compact trigger remains visible at 320/375/390 px in the fixed `h-14` header. The trigger/container uses `min-w-0`, bounded max widths, and text truncation so search, notifications, language, theme, and account controls remain visible.
- The switcher uses existing design patterns, no icon library, no card-like wrapper, and no explanatory header copy. The listbox contains only selectable `option` rows; loading/empty rows are non-focusable `role="status"` content and error rows are non-focusable `role="alert"` content.
- New header/switcher strings are localized through existing `messages/*.json` patterns, including Facility, Product Line, loading, empty, error, and aria labels.
- Skills and local/gateway sessions/transcripts remain Facility/global and are excluded from Product Line-specific counts.
- Playwright keeps existing snapshots unchanged for flag OFF and covers new switcher states, accessibility, duplicate Facility prevention, and cross-tab behavior under flag ON.
```

### Clarify Results

| Session | Focus Area | Questions | Key Outcomes |
|---------|------------|-----------|--------------|
| 1 | Product-line state and Facility semantics | 5 | Encoded Facility as aggregate, `activeWorkspace = null` compatibility semantics, `setActiveProductLine(...)`, stale hydrate validation, synthetic Facility suppression, facility-row rejection, global-agent/id mutation semantics, `scopeKey` invalidation, and flag bootstrap context; no consensus required |
| 2 | REST and SSE authorization | 3 | Encoded `workspace_id` vs `workspace_scope=facility`, same-request `400`, unauthorized `403`, facility-row-as-product-line `400`, concrete route matrix, resource-id authorization, and `/api/events` scope requirements. Consensus tightened REST `{ error }` wording and clarified that SPEC-002 must add server-side SSE scope authorization, authorized Facility aggregation, client filtering as defense in depth, reconnect on scope change, and a named global-event allowlist. |
| 3 | UI, persistence, and regression boundaries | 5 | Encoded header terminology, desktop/mobile switcher placement, no icon-library/card/header-copy constraints, listbox state-row accessibility, `messages/*.json` localization, Facility/global exclusions for skills and local/gateway sessions/transcripts, and Playwright flag-OFF/flag-ON regression coverage; no consensus required. |

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

- Strict Scope: new production modules are limited to `src/components/layout/workspace-switcher.tsx`, `src/types/product-line.ts`, and `src/lib/feature-flags.ts`; existing store/header/panel/API/SSE/message files plus `tsconfig.spec-strict.json` and `eslint.config.mjs` may be touched only for documented Phase 1 behavior.
- Preserve flag-off behavior and existing snapshots.
- Add `resolveFlag(name, ctx)` before any runtime feature behavior.
- Define flag bootstrap context before UI work: `FEATURE_WORKSPACE_SWITCHER` uses authenticated tenant/facility flag context from `/api/workspaces`, not selected `activeWorkspace`; flag-ON Facility tests seed `workspaces.feature_flags` and do not use env `1` as the ON path.
- Keep `activeTenant` and Product Line scope as independent state concepts.
- Do not select the real `facility` workspace row through the switcher; Facility means authenticated aggregate scope and only maps to `activeWorkspace = null` after initialization.
- Reject the real `facility` workspace row as Product Line `workspace_id` in REST, URL scope parsing, and SSE setup.
- Filter only the roadmap-listed mode-sensitive panels. Facility/global surfaces must not be falsely wired as Product Line-owned.
- REST/SSE scope checks must prevent cross-tenant or unauthorized workspace leakage.
- URL state must carry and validate scope for mode-sensitive detail views or strip unsafe entity params.
- Mode-sensitive cached data must not render before persisted scope is validated after `/api/workspaces`.
- Do not implement downstream specs or task pipeline behavior.
- Preserve SC-15/V2-001: any touched gateway-facing code must avoid new direct `OPENCLAW_GATEWAY_*`, `config.gatewayHost`, `config.gatewayPort`, or `gateways.is_primary` assumptions outside an approved resolver/adapter.

## Architecture Notes

- `src/store/index.ts` is the live store path; there is no `src/store/mission-control-store.ts`.
- The roadmap says no existing `persist` middleware and no existing `BroadcastChannel` listener are present. Implement cross-tab sync from scratch for the Product Line scope slice only.
- `resolveFlag()` reads `workspaces.feature_flags JSON` per workspace; hard-default OFF; env value `0` forces OFF; env value `1` does not force ON except for roadmap-approved `PILOT_PRODUCT_LINE_A_E2E`.
- `setActiveProductLine(productLine | null, options)` is the stable transition API and owns persistence, validation reset, URL cleanup, BroadcastChannel acceptance, cache invalidation, and stale-response guards.
- Runtime scope is discriminated as Facility or Product Line; requests/cache keys use `scopeKey = tenantId + ":" + ("facility" | productLineId)`.
- Mode-sensitive panel list: task board, agent squad, project manager modal, quality-review surfaces, and DB-backed chat message/conversation surfaces.
- Facility/global surface list: live feed, notifications, dashboard, system monitor, audit trail, skills, and local/gateway sessions/transcripts.
- Route matrix includes task routes (`/api/tasks`, `/api/tasks/[id]`, `/api/tasks/[id]/comments`, `/api/tasks/[id]/broadcast`, `/api/tasks/[id]/branch`, `/api/tasks/queue`, `/api/tasks/outcomes`, `/api/tasks/regression`), project routes (`/api/projects`, `/api/projects/[id]`, `/api/projects/[id]/agents`, `/api/projects/[id]/tasks`), agent root/detail/subroutes, quality-review, DB chat message/conversation routes, `/api/search`, `/api/activities`, `/api/notifications`, dashboard/status/audit/live-feed backing routes, `/api/system-monitor`, and `/api/events`.
- Skills and local/gateway sessions/transcripts are deferred from Product Line ownership; multi-facility tenant modeling is out of scope.

## Verification Strategy

- Add focused Vitest coverage for `resolveFlag()` default, JSON override, env kill-switch, null workspace, malformed JSON, missing row behavior, `FEATURE_*=1` not forcing ON, and `PILOT_PRODUCT_LINE_A_E2E=1` as the only env-force-ON exception.
- Add store tests for `setActiveProductLine(productLine | null, options)`, serialization, localStorage hydrate, `/api/workspaces` validation, guarded BroadcastChannel update, stale-version rejection, stale in-flight response rejection, scoped state invalidation (`activeProject`, selected task/agent/project/conversation, scoped modals, filters, drafts), and no-op fallback.
- Add route tests for `workspace_id`, `workspace_scope=facility`, both-params `400`, unauthorized `403`, facility-row-as-product-line `400`, omitted scope legacy behavior, and aggregate mode.
- Add SSE tests for selected Product Line, Facility aggregate, facility-row-as-product-line setup rejection, missing/mismatched `workspace_id`, EventSource reconnect on scope change, and whitelisted global events.
- Add URL tests for valid scoped links, invalid scopes, and unscoped entity params that cannot prove ownership.
- Add Playwright coverage for switcher rendering, Facility scope, selected Product Line filtering, duplicate Facility prevention, loading/empty/error states, long names, keyboard behavior, focus return, mobile widths, preserved header controls, non-focusable state rows, localized visible/aria labels, and cross-tab sync.
- Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and as much of `pnpm test:e2e` or `pnpm test:all` as the environment allows.
```

### Plan Results

| Artifact | Status | Notes |
|----------|--------|-------|
| `plan.md` | Complete | Records strict scope, feature-flag architecture, transition contract, and G3-passable plan structure |
| `research.md` | Complete | Captures state persistence, authorization, cache/URL ownership, SSE scoping, deferred boundaries, and regression priorities |
| `data-model.md` | Complete | Summarizes Tenant, Facility Scope, Product Line Workspace, Active Product Line Scope, `scopeKey`, and flag context data |
| `contracts/` | Complete | `contracts/product-line-scope.md` records scope resolution, UI, state, REST, and SSE contracts |
| `quickstart.md` | Complete | Documents artifact checks, flag-off baseline, flag-on scope check, and implementation notes |

---

## Phase 4: Domain Checklists

**When to run:** After Plan. Run the checklists below and resolve all genuine gaps before Tasks.

### 1. State Management Checklist

```bash
$speckit-checklist state-management

Focus on SPEC-002 requirements:
- Product Line scope is independent from `activeTenant`.
- Runtime scope is discriminated as Facility or Product Line; `activeWorkspace = null` is only compatibility state after initialization.
- `setActiveProductLine(productLine | null, options)` is the only public transition path.
- Zustand persistence uses key `mc:active-workspace:v1` for the Product Line scope slice only.
- `scopeKey` is used for mode-sensitive request/cache ownership.
- BroadcastChannel sync updates other tabs within 1s, includes tenant/session guards, rejects stale versions, and falls back gracefully when unavailable.
- Scope changes clear incompatible `activeProject`, selected task/agent/project/conversation state, scoped modals, filters, and drafts unless keyed by `scopeKey`.
- Pay special attention to hydration ordering, stale localStorage values, invalid workspace ids, real `facility` row ids, stale in-flight responses, optimistic mutations, drafts, local filters, and activeTenant changes.
```

### 2. API Contracts Checklist

```bash
$speckit-checklist api-contracts

Focus on SPEC-002 requirements:
- Route matrix covers task routes (`/api/tasks`, `/api/tasks/[id]`, `/api/tasks/[id]/comments`, `/api/tasks/[id]/broadcast`, `/api/tasks/[id]/branch`, `/api/tasks/queue`, `/api/tasks/outcomes`, `/api/tasks/regression`), project routes (`/api/projects`, `/api/projects/[id]`, `/api/projects/[id]/agents`, `/api/projects/[id]/tasks`), agent root/detail/subroutes, quality-review, DB chat message/conversation routes, `/api/search`, `/api/activities`, `/api/notifications`, dashboard/status/audit/live-feed backing routes, `/api/system-monitor`, and `/api/events`.
- Product Line requests use `workspace_id`; Facility requests use `workspace_scope=facility`; both params return `400`; unauthorized workspace ids return the repo's normal `403` shape; the real `facility` row as Product Line `workspace_id` returns `400`.
- Omitted scope is legacy-only when the feature flag is OFF.
- Resource detail/mutation routes authorize by explicit scope or by resource id joined back to tenant/workspace.
- `/api/events` reconnects EventSource on Facility/Product Line scope changes.
- Pay special attention to SSE event leaks, missing `workspace_id` payloads, whitelisted global events, header search leakage, task queue/outcome/regression mutations, and route handlers still defaulting to `auth.user.workspace_id`.
```

### 3. UX Checklist

```bash
$speckit-checklist ux

Focus on SPEC-002 requirements:
- Header no longer labels tenant context as "Workspace."
- Product Line switcher appears only when the feature flag is enabled.
- Facility and selected Product Line states are visually distinct without explanatory header/chrome copy.
- The switcher is visible at 320/375/390 px, uses `min-w-0`, bounded max widths, and truncates long names without pushing out search, notifications, language, theme, or account controls.
- The popover implements listbox accessibility, duplicate Facility prevention, selected state, keyboard navigation, outside-click/Escape close, and focus return; loading/empty/error content is non-focusable status/alert content outside the selectable option set.
- Header/switcher copy follows existing `messages/*.json` localization patterns, including Facility, Product Line, loading, empty, error, and aria labels.
- Mode-sensitive and Facility/global surfaces behave consistently with the panel taxonomy.
- Pay special attention to loading, empty, unauthorized, workspace-list failure, long-name, and real `facility` workspace edge cases.
```

### 4. Regression Safety Checklist

```bash
$speckit-checklist regression-safety

Focus on SPEC-002 requirements:
- Flag OFF preserves existing behavior, test counts, and Playwright snapshots.
- Flag ON with Facility scope preserves existing baseline behavior for existing tests while new tests assert Facility aggregate semantics.
- New tests cover only SPEC-002 behavior and do not encode SPEC-003+ assumptions.
- Grep checks catch inline `process.env.FEATURE_*` reads outside `resolveFlag()`.
- Grep checks catch new direct `OPENCLAW_GATEWAY_*`, `config.gatewayHost`, `config.gatewayPort`, or `gateways.is_primary` assumptions outside approved resolver/adapter paths when gateway-facing code is touched.
- Pay special attention to accidental downstream implementation of Aegis, task pipelines, ready_for_owner, area labels, artifacts, governance, product-line skill ownership, session/transcript mapping, tenant-routed gateway selection, or multi-facility tenant modeling.
```

### Checklist Results

| Checklist | Items | Gaps | Spec References |
|-----------|-------|------|-----------------|
| state-management | 20 | 0 | P1-AC2, P1-AC3, P1-AC6, P1-AC7, P1-AC11, P1-AC14, P1-AC15; added persistence key/slice boundary, stale hydration rejection, tenant-change reset, BroadcastChannel stale-version/fallback semantics, stale `scopeKey` completion rejection, and corrected plan strict-scope wording |
| api-contracts | 22 | 0 | P1-AC4, P1-AC9, P1-AC10, P1-AC14, P1-AC15; added live route matrix, explicit `{ error }` status behavior, flag-ON omitted-scope rules, query ownership, `/api/search` leakage guard, task queue/outcome/regression coverage, SSE allowlist/reconnect rules, and consensus fixes for malformed-vs-unauthorized scope status, duplicate/conflicting scope carriers, and dashboard/live-feed traceability |
| ux | 19 | 0 | P1-AC3, P1-AC4, P1-AC5, P1-AC8, P1-AC13; added visual state distinction, full keyboard/focus/listbox behavior, workspace-list failure and unauthorized-selection states, explicit panel taxonomy, UX acceptance traceability, and quickstart UX/accessibility checks |
| regression-safety | 21 | 0 | P1-AC1, P1-AC2, P1-AC12, P1-AC16, downstream scope boundaries; added baseline test-count/snapshot parity, flag-ON Facility aggregate regression split, SPEC-002-only test boundary, feature-flag grep guardrail, and gateway-assumption grep guardrail |
| Total | 82 | 0 | G4 passed with zero gap markers |

### Addressing Gaps

If a checklist reports `[Gap]`, update the generated `spec.md` or `plan.md` with the smallest concrete clarification, then re-run that checklist. Do not resolve a gap by widening SPEC-002 into downstream runtime specs.

---

## Phase 5: Tasks

**When to run:** After checklists pass. Output: `specs/002-product-line-switcher/tasks.md`.

### Tasks Prompt

```bash
$speckit-tasks

## Task Structure

- Small, testable chunks tied to P1-AC1 through P1-AC16.
- Use TDD where feasible: write or update focused Vitest/Playwright tests before implementation.
- Order tasks by dependency:
  1. Baseline inspection and flag-off regression harness.
  2. `resolveFlag()` helper, bootstrap flag-context tests, and `PILOT_PRODUCT_LINE_A_E2E` exception tests.
  3. `ProductLine` type and Product Line scope store slice with `setActiveProductLine(productLine | null, options)`, persistence, validation, cache, URL, scoped invalidation, and broadcast tests.
  4. Header terminology fix, localized copy, and accessible responsive `workspace-switcher.tsx` UI.
  5. REST scoping and authorization tests/implementation across the route matrix.
  6. SSE scoping tests/implementation, including missing/mismatched `workspace_id` handling, facility-row rejection, EventSource reconnect, and whitelisted global events.
  7. Mode-sensitive panel wiring, Facility/global boundary checks, and stale-response invalidation.
  8. Playwright cross-tab, selected Product Line, Facility, mobile, keyboard, duplicate Facility, and non-happy-state behavior.
  9. Strict-scope config updates for the three new TS/TSX modules.
  10. Prohibited-drift grep checks, docs status, P1 evidence ledger, and final verification.
- Mark parallel-safe tasks with [P] only when they do not touch the same file or state contract.

## Required Task Coverage

- P1-AC1 and P1-AC2 each have explicit flag-off/Facility regression tasks.
- P1-AC2 includes flag-ON Facility bootstrap tests seeded through `workspaces.feature_flags`, with env `1` proving it does not enable normal `FEATURE_*` flags.
- P1-AC3 has tests proving exactly one synthetic Facility option maps to Facility scope and not the real `facility` workspace row; REST, URL, and SSE setup tests reject `workspace_id=<facilityRowId>` as Product Line scope.
- P1-AC6 and P1-AC11 cover localStorage and BroadcastChannel behavior.
- P1-AC9 and P1-AC10 cover explicit request scope, both-params `400`, unauthorized workspace, facility-row-as-product-line `400`, missing SSE payload, EventSource reconnect, and SSE leak-prevention cases across the full route matrix.
- P1-AC8 includes a grep check against `header-bar.tsx` tenant-context label usage.
- P1-AC12 through P1-AC16 each have explicit tasks or verification tasks for terminology, accessibility, cache isolation, URL ownership, and deferred boundaries.
- Generated tasks include `tsconfig.spec-strict.json` and `eslint.config.mjs` updates for `src/components/layout/workspace-switcher.tsx`, `src/types/product-line.ts`, and `src/lib/feature-flags.ts`.
- Generated tasks include a route-discovery task that records the exact live `src/app/api/**/route.ts` files in scope before implementation and prevents the generic route matrix from dropping `/api/search`, task queue/outcomes/regression, project tasks, activities, notifications, status/dashboard, audit, system-monitor, or events coverage.
- Tasks must not implement SPEC-003, SPEC-004, SPEC-005, SPEC-006, SPEC-007, SPEC-008, or SPEC-009 behavior.

## File Layout Constraints

- Primary new files: `src/components/layout/workspace-switcher.tsx`, `src/types/product-line.ts`, `src/lib/feature-flags.ts`.
- Strict-scope config files: `tsconfig.spec-strict.json`, `eslint.config.mjs`.
- Store changes: `src/store/index.ts`.
- Header change: `src/components/layout/header-bar.tsx`.
- Message files: `messages/*.json` for localized header/switcher copy and aria labels.
- Mode-sensitive panel changes: `src/components/panels/task-board-panel.tsx`, `src/components/panels/agent-squad-panel-phase3.tsx`, `src/components/modals/project-manager-modal.tsx`, quality-review surfaces, and DB chat surfaces under `src/components/chat` or `src/components/panels`.
- Facility/global boundary verification checks by default: `skills-panel.tsx`, local/gateway session/transcript surfaces, and awareness panels are touched only if a failing SPEC-002 test proves false Product Line ownership or stale authenticated-workspace-only aggregate behavior.
- API changes: inspect and update the concrete route matrix under `src/app/api`, including tasks root/detail/comment/broadcast/branch/queue/outcomes/regression, projects root/detail/agents/tasks, agents root/detail/subroutes, quality-review, chat messages/conversations, search, activities, notifications, status/dashboard, audit, system-monitor/live-feed backing routes, and events.
- Spec artifacts: `specs/002-product-line-switcher/`.
- Avoid unrelated cleanup and do not touch implementation surfaces outside the SPEC-002 scope unless a failing test proves it is required.
```

### Tasks Results

| Metric | Value |
|--------|-------|
| Total Tasks | 50 |
| Phases | 8 |
| Parallel Opportunities | 6 groups |
| User Stories Covered | 5 stories / 17 acceptance criteria |

---

## Phase 6: Analyze

**When to run:** Always run after Tasks.

### Analyze Prompt

```bash
$speckit-analyze

Focus on:
1. Constitution alignment: feature-flag default OFF, upstream-safe discipline, TDD, strict-scope ramp, and no unauthorized data leaks.
2. Acceptance coverage: P1-AC1 through P1-AC16 each have implementation or verification tasks.
3. State consistency: Product Line scope remains independent from `activeTenant`; `setActiveProductLine(productLine | null, options)` owns every transition; Facility/null compatibility semantics are not confused with the real facility workspace row.
4. API/SSE consistency: every scoped route in the concrete matrix has authorization checks and tests for unauthorized scope, both-params `400`, facility-row-as-product-line `400`, missing SSE scope payloads, EventSource reconnect on scope change, and whitelisted global events.
5. Cache/URL consistency: mode-sensitive cache keys include `scopeKey`, stale in-flight responses are ignored, unowned URL entity params are stripped, and incompatible `activeProject`, selected task/agent/project/conversation state, scoped modals, filters, and drafts are cleared on scope changes unless keyed by `scopeKey`.
6. Regression discipline: flag-off and Facility behavior preserve existing tests and snapshots.
7. Dependency discipline: generated tasks must not implement Aegis refactor, task pipelines, ready_for_owner, area-label sync, artifacts, governance, pilot behavior, product-line skill ownership, session/transcript mapping, tenant-routed gateway selection, or multi-facility tenant modeling.
8. Traceability discipline: terminology table, SC-3, SC-14, SC-15/V2-001, SC-16, P1-AC12 through P1-AC16, and deferred boundaries match across PRD, roadmap, workflow, and generated spec artifacts.
9. File-path truthfulness: tasks use the live paths `src/store/index.ts`, `src/components/layout/header-bar.tsx`, `src/components/modals/project-manager-modal.tsx`, `messages/*.json`, `tsconfig.spec-strict.json`, `eslint.config.mjs`, and the current API/panel files.
10. Gateway-readiness discipline: if gateway-facing code is touched, the diff does not add direct `OPENCLAW_GATEWAY_*`, `config.gatewayHost`, `config.gatewayPort`, or `gateways.is_primary` assumptions outside an approved resolver/adapter with a V2-001 reference.
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
| A1 | HIGH | Route-matrix task coverage did not require every T002-discovered scoped route to exercise unauthorized scope, both-params `400`, and real `facility` row as Product Line `400`. | Tightened T035 to require authorized behavior plus invalid/unauthorized scope cases for each scoped route in the concrete matrix, including `/api/events`. |
| A2 | HIGH | SSE task coverage omitted real `facility` row setup rejection and did not explicitly bind EventSource reconnect to closing/reopening the stream or the global-event allowlist. | Tightened T041 and T044 to cover facility-row setup rejection, missing/mismatched `workspace_id`, EventSource close/reconnect on scope change, the documented connection/system global event allowlist, and `eventBus` producer/source enforcement so non-allowlisted workspace-scoped broadcasts include `workspace_id` before streaming. |
| A3 | HIGH | Cache/URL/state tasks did not explicitly cover invalid scoped URL reset, unowned entity-param stripping, stale optimistic mutation completion rejection, or the full selected task/agent/project/conversation invalidation list. | Tightened T019, T023, and T025 to cover invalid URL reset, unowned entity-param stripping, stale in-flight and mutation completion rejection, and full scoped state invalidation unless keyed by `scopeKey`. |
| A4 | MEDIUM | P1-AC5 agent-squad coverage was too generic to prove Facility globals -> Product Line -> Department -> Agent hierarchy or duplicate global/local name safety. | Tightened T042 and T045 to require hierarchy, duplicate-name stats separation, and id-based mutation semantics. |
| A5 | MEDIUM | Generated traceability lacked an explicit terminology/marker table mapping PRD/roadmap SC-3, SC-14, SC-15/V2-001, SC-16, P1-AC12-P1-AC16, and deferred boundaries back to SPEC-002 artifacts. | Added `Terminology and Traceability Alignment` to `spec.md` and tightened T047 to keep final traceability notes aligned with the route matrix and generated tasks. |
| A6 | LOW | Facility/global boundary tasks used generic awareness wording instead of the live panel/chat paths available in this worktree. | Tightened T043 and T046 with concrete live path examples for skills, sessions/transcripts, chat, notifications, system monitor, and audit trail surfaces. |

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
5. RECORD: Add the command/test/grep/manual proof to the P1 evidence ledger before marking the related acceptance criterion complete.

### Pre-Implementation Setup

1. Verify branch: `git rev-parse --abbrev-ref HEAD` must return `002-product-line-switcher`.
2. Verify package manager: lockfile is `pnpm-lock.yaml`; use pnpm only.
3. Verify SPEC-001 is present in this branch and roadmap marks it complete.
4. Inspect current store/header/API paths:
   - `src/store/index.ts`
   - `src/components/layout/header-bar.tsx`
   - `src/components/modals/project-manager-modal.tsx`
   - `messages/*.json`
   - `tsconfig.spec-strict.json`
   - `eslint.config.mjs`
   - `src/app/api/tasks/route.ts`
   - `src/app/api/tasks/[id]/route.ts`
   - `src/app/api/tasks/[id]/comments/route.ts`
   - `src/app/api/tasks/[id]/broadcast/route.ts`
   - `src/app/api/tasks/[id]/branch/route.ts`
   - `src/app/api/tasks/queue/route.ts`
   - `src/app/api/tasks/outcomes/route.ts`
   - `src/app/api/tasks/regression/route.ts`
   - `src/app/api/agents/route.ts`
   - `src/app/api/projects/route.ts`
   - `src/app/api/projects/[id]/route.ts`
   - `src/app/api/projects/[id]/agents/route.ts`
   - `src/app/api/projects/[id]/tasks/route.ts`
   - `src/app/api/quality-review/route.ts`
   - `src/app/api/chat/messages/route.ts`
   - `src/app/api/chat/conversations/route.ts`
   - `src/app/api/search/route.ts`
   - `src/app/api/activities/route.ts`
   - `src/app/api/notifications/route.ts`
   - `src/app/api/status/route.ts`
   - `src/app/api/audit/route.ts`
   - `src/app/api/system-monitor/route.ts`
   - `src/app/api/events/route.ts`
5. Capture baseline tests/snapshots before enabling any new behavior.

### Implementation Notes

- Implement `resolveFlag(name, ctx)` first and route all new runtime behavior through it.
- Keep all flags hard-default OFF.
- `FEATURE_WORKSPACE_SWITCHER` flag-ON test fixtures use `workspaces.feature_flags`; env `1` does not force ON for normal `FEATURE_*` flags. Preserve `PILOT_PRODUCT_LINE_A_E2E=1` as the only env-force-ON exception.
- Use `workspaces.feature_flags` from SPEC-001 as storage only; do not add new schema unless a fresh, explicit plan proves it is required.
- Add only the Product Line scope persistence behavior through `setActiveProductLine(productLine | null, options)`; do not wrap unrelated store slices.
- Treat Facility as authenticated aggregate scope; do not select the real `facility` row in the switcher.
- Reject the real `facility` workspace row when it is supplied as Product Line `workspace_id` in REST, URL, or SSE setup.
- Preserve `activeTenant`; do not mutate it from switcher actions.
- Filter only mode-sensitive panels listed by the roadmap; Facility/global surfaces must not become Product Line-owned.
- Add authorization checks before applying requested `workspace_id`, `workspace_scope=facility`, URL scope, or SSE scope.
- Apply `scopeKey` to mode-sensitive caches/requests; clear incompatible activeProject/selected task/agent/project/conversation/modals/filters/drafts on scope changes; ignore stale in-flight responses and stale scoped mutation completions.
- Reconnect `/api/events` EventSource when Facility/Product Line scope changes.
- Do not introduce downstream task-pipeline, Aegis, ready_for_owner, area-label, artifact, governance, pilot behavior, product-line skill ownership, session/transcript mapping, tenant-routed gateway selection, or multi-facility tenant modeling.
- If gateway-facing code is touched, preserve SC-15/V2-001 by avoiding new direct process-global gateway assumptions outside an approved resolver/adapter.

### Verification Commands

Run the smallest reliable subset first, then broader checks:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- Focused Vitest filters for `feature-flags`, store persistence/broadcast, scope validation, cache/URL ownership, scoped API routes, and SSE scoping
- Focused Playwright check for switcher display, Facility mode, selected Product Line mode, responsive widths, preserved header controls, keyboard behavior, duplicate Facility prevention, non-focusable loading/empty/error rows, localized labels, and cross-tab sync
- `pnpm test:e2e` or `pnpm test:all` when the local environment can bind browser/server ports
- Grep checks:
  - no inline runtime `process.env.FEATURE_` reads outside `src/lib/feature-flags.ts`
  - no "Workspace" tenant-context label in `src/components/layout/header-bar.tsx`
  - no downstream `ready_for_owner`, `task_templates`, `area:*`, artifact-store, governance, product-line skill ownership, session/transcript mapping, tenant-routed gateway selection, or multi-facility tenant modeling drift outside roadmap-approved contexts
  - no new direct `OPENCLAW_GATEWAY_*`, `config.gatewayHost`, `config.gatewayPort`, or `gateways.is_primary` assumptions outside approved resolver/adapter paths when gateway-facing code is touched
```

### Implementation Progress

| Phase | Tasks | Completed | Notes |
|-------|-------|-----------|-------|
| 1 - Baseline, flags, and state | Complete | 8 | `feature-flags.ts`, Product Line types, store slice, workspace-scope validation, and equivalent repo-native tests landed |
| 2 - Header and switcher UI | Complete | 3 | Header renders `WorkspaceSwitcher`; switcher listbox, Facility/Product Line copy, loading/empty/error states, and localized strings landed |
| 3 - REST and SSE scoping | Complete | 8 | Task, project, agent, support, workspace, and `/api/events` routes use accepted Facility/Product Line scope |
| 4 - Panel integration | Complete | 2 | Mode-sensitive panels and chat surfaces append selected scope; Facility/global surfaces were not Product Line-owned without a failing test |
| 5 - Verification and bookkeeping | Complete | 4 | All generated tasks are checked; full verification passed with typecheck, lint, unit, build, and 526 Playwright tests |

---

### Phase 7 Recovery Plan

Recovered on 2026-04-26 after the open-file cleanup interruption. The active implementation state is the SPEC-002 worktree on branch `002-product-line-switcher`. Phases 0 through 6 were complete, G6 had passed, and the production implementation had passed broad verification. The recovery pass closed the generated standalone coverage backlog and G7 now passes.

Every remaining step must follow the Open File Hygiene guard above: use bounded reads, avoid leaving dev servers, Playwright servers, subagents, MCP helpers, or shell sessions open, and check for duplicate direct Codex helper children before advancing.

| Recovery Group | Tasks | Status | Completion Evidence Required |
|----------------|-------|--------|------------------------------|
| A - Flag bootstrap, flag-off behavior, and terminology guards | T010-T012, T030 | Complete | `pnpm test -- src/store/workspace-init.test.ts src/store/workspace-flag-off.test.ts src/components/layout/header-bar-terminology.test.ts src/lib/__tests__/feature-flags.test.ts` passed 99 files / 1015 tests; `FEATURE_WORKSPACE_SWITCHER=0 pnpm exec playwright test tests/workspace-switcher-flag-off.spec.ts` passed |
| B - Store persistence, cache/URL ownership, and cross-tab sync | T016-T020 | Complete | `pnpm test -- src/store/set-active-product-line.test.ts src/store/product-line-persistence.test.ts src/store/product-line-broadcast.test.ts src/store/product-line-cache-url.test.ts src/store/product-line-scope.test.ts src/types/product-line.test.ts` passed 103 files / 1027 tests; `pnpm exec playwright test tests/product-line-cross-tab.spec.ts` passed |
| C - Switcher UI, accessibility, and responsive coverage | T027-T029 | Complete | `pnpm test -- src/components/layout/workspace-switcher.test.tsx` passed 104 files / 1030 tests; `pnpm exec playwright test tests/workspace-switcher-a11y.spec.ts tests/workspace-switcher-responsive.spec.ts` passed 4 browser tests |
| D - REST route matrix, route discovery, and SSE contracts | T035-T036, T041 | Complete | `pnpm exec playwright test tests/product-line-scope-matrix.spec.ts tests/product-line-route-discovery.spec.ts tests/product-line-events.spec.ts` passed 4 tests |
| E - Panel wiring and Facility/global boundaries | T042-T043 | Complete | `pnpm test -- src/components/panels/product-line-panels.test.ts src/components/panels/facility-global-boundaries.test.ts` passed 106 files / 1035 tests; post-code-review `pnpm test` passed 106 files / 1037 tests |
| F - Final G7 validation and status sync | Complete | No generated task ids | All `tasks.md` tasks checked, G7 evidence ledger rows pass, PRD/roadmap status updated, full verification rerun, and helper cleanup check recorded |

---

### Acceptance Evidence Ledger

Populate this ledger before G7 is marked complete. Every row must cite the command, test, grep, or manual artifact that proves the acceptance criterion.

| Criterion | Required Evidence | Result | Commit/Artifact |
|-----------|-------------------|--------|-----------------|
| P1-AC1 | Flag-OFF `pnpm test:all` or documented focused fallback plus unchanged existing snapshot count | Pass | `pnpm test:e2e` passed 526 tests with switcher flag hard-default OFF; post-code-review `pnpm test` passed 1037 tests |
| P1-AC2 | Flag-ON Facility test run seeded through `workspaces.feature_flags`; env `1` is not used as the ON path | Pass | `src/lib/__tests__/feature-flags.test.ts`, `src/store/workspace-init.test.ts`, `src/store/workspace-flag-off.test.ts`, and `tests/workspace-switcher-flag-off.spec.ts` |
| P1-AC3 | Switcher and server-side tests prove one synthetic Facility option and reject `workspace_id=<facilityRowId>` as Product Line scope | Pass | `src/types/product-line.test.ts`; `tests/product-line-scope-api.spec.ts` |
| P1-AC4 | Mode-sensitive panel/API tests prove selected Product Line filtering and Facility/global aggregate behavior | Pass | `tests/product-line-scope-matrix.spec.ts`; `src/components/panels/product-line-panels.test.ts`; `src/components/panels/facility-global-boundaries.test.ts` |
| P1-AC5 | Agent squad UI/data tests prove Facility globals -> Product Line -> department -> agent hierarchy and id-based duplicate handling | Pass | `src/components/panels/product-line-panels.test.ts` |
| P1-AC6 | BroadcastChannel Playwright/Vitest evidence proves guarded cross-tab update, stale-version rejection, and reload fallback | Pass | `src/store/product-line-broadcast.test.ts`; `tests/product-line-cross-tab.spec.ts` |
| P1-AC7 | Store tests prove `activeTenant` is not mutated by `setActiveProductLine(productLine | null, options)` | Pass | `src/store/product-line-scope.test.ts`; implementation keeps `activeTenant` separate |
| P1-AC8 | Grep or component test proves tenant/facility context is no longer labeled "Workspace" | Pass | `rg -n 'Workspace' src/components/layout/header-bar.tsx messages/en.json`; header matches are internal `WorkspaceSwitcher` symbol only |
| P1-AC9 | Route tests cover explicit scope, both-param `400`, unauthorized `403`, facility-row `400`, and legacy omitted-scope behavior across the concrete matrix | Pass | `tests/product-line-scope-api.spec.ts`; `tests/product-line-scope-matrix.spec.ts`; `pnpm test:e2e` passed 526 tests |
| P1-AC10 | `/api/events` tests cover Product Line, Facility, missing/mismatched `workspace_id`, EventSource reconnect, and whitelisted global events | Pass | `tests/product-line-events.spec.ts`; `src/lib/use-server-events.test.tsx` |
| P1-AC11 | Store tests cover persistence key, serialization, hydrate validation, guarded BroadcastChannel, and fallback behavior | Pass | `src/types/product-line.test.ts`; `src/store/product-line-scope.test.ts`; `src/store/product-line-persistence.test.ts`; `src/store/product-line-broadcast.test.ts` |
| P1-AC12 | Traceability/grep evidence proves Facility/Product Line/tenant terminology and no multi-facility tenant modeling | Pass | `spec.md`, `plan.md`, `quickstart.md`, PRD, and roadmap traceability sections |
| P1-AC13 | Playwright/a11y/component tests prove 320/375/390 px layout, truncation, preserved header controls, localized labels, listbox semantics, and focus return | Pass | `src/components/layout/workspace-switcher.test.tsx`; `tests/workspace-switcher-a11y.spec.ts`; `tests/workspace-switcher-responsive.spec.ts` |
| P1-AC14 | Cache/request tests prove `scopeKey`, scoped invalidation, stale in-flight response rejection, and stale mutation completion rejection | Pass | `src/store/product-line-cache-url.test.ts`; `src/store/product-line-scope.test.ts`; `src/components/panels/product-line-panels.test.ts` |
| P1-AC15 | URL tests prove valid scope adoption, invalid scope reset, and unowned entity param stripping | Pass | `src/store/product-line-cache-url.test.ts`; `tests/product-line-route-discovery.spec.ts`; `tests/product-line-scope-matrix.spec.ts` |
| P1-AC16 | Deferred-boundary and SC-15/V2-001 grep/tests prove no product-line skill ownership, session/transcript mapping, tenant-routed gateway selection, or multi-facility modeling | Pass | `src/components/panels/facility-global-boundaries.test.ts`; diff grep found no new runtime gateway globals or downstream-boundary implementations |

---

## Post-Implementation Checklist

- [x] All generated tasks are marked complete in `specs/002-product-line-switcher/tasks.md`.
- [x] The Acceptance Evidence Ledger above has a result row for each P1-AC1 through P1-AC16.
- [x] `src/lib/feature-flags.ts` implements the Feature Flag Resolution Policy, including normal `FEATURE_*=1` non-enablement and the `PILOT_PRODUCT_LINE_A_E2E=1` exception.
- [x] `tsconfig.spec-strict.json` and `eslint.config.mjs` include the three new TS/TSX modules in strict scope.
- [x] `src/store/index.ts` contains `setActiveProductLine(productLine | null, options)`, Product Line scope persistence, validation, scoped cache/state invalidation, URL cleanup, and BroadcastChannel sync only for the new scope slice.
- [x] `src/components/layout/header-bar.tsx` no longer labels tenant context as "Workspace."
- [x] `src/components/layout/workspace-switcher.tsx` exists, is flag-gated through authenticated tenant/facility flag context, and is not enabled by env `1`.
- [x] `messages/*.json` include localized header/switcher copy and aria labels for Facility, Product Line, loading, empty, and error states.
- [x] REST and SSE scoping tests cover authorized, unauthorized, both-param, Facility aggregate, facility-row-as-product-line, missing-payload, EventSource reconnect, and whitelisted global-event cases.
- [x] Mode-sensitive panels respect selected Product Line scope; Facility/global surfaces do not become Product Line-owned.
- [x] URL scope, stale in-flight response, stale mutation completion, scoped invalidation, duplicate Facility, long-name, loading, empty, error, localized label, and mobile header checks pass.
- [x] Deferred-boundary checks prove SPEC-002 did not implement product-line skill ownership, session/transcript mapping, tenant-routed gateway selection, or multi-facility tenant modeling.
- [x] SC-15/V2-001 grep checks prove no new direct `OPENCLAW_GATEWAY_*`, `config.gatewayHost`, `config.gatewayPort`, or `gateways.is_primary` assumptions were added outside approved resolver/adapter paths when gateway-facing code was touched.
- [x] `pnpm typecheck` passes or any environment failure is documented with evidence.
- [x] `pnpm lint` passes or any environment failure is documented with evidence.
- [x] `pnpm test` passes or any environment failure is documented with evidence.
- [x] E2E verification passes, including dedicated cross-tab verification.
- [x] Prohibited-drift grep checks pass.
- [x] `docs/ai/rc-factory-technical-roadmap.md` records SPEC-002 implementation-complete verification evidence and preserves the PR-merge status caveat.
- [x] `docs/rc-factory-v1-prd.md` reflects SPEC-002 implementation completion after verification.
- [x] Branch is pushed for review.
- Draft PR: https://github.com/racecraft-lab/mission-control/pull/16

### Final Verification Evidence

- `pnpm typecheck` passed.
- `pnpm lint` passed with 0 errors / 11 warnings.
- `pnpm test` passed 106 files / 1037 tests after post-code-review remediation.
- `pnpm build` passed.
- `pnpm test:e2e` passed 526 tests.
- `git diff --check` passed.
- Focused remediation verification passed for tenant access, workspace switcher failure/empty state, Product Line store/cache scope, and Product Line API/SSE route contracts.
- Code review remediation preserved Facility/global agent visibility inside Product Line views, distinguished workspace-load failure from true empty Product Line state, and enforced JSON body scope carriers plus query/body conflicts through `resolveWorkspaceScopeFromRequest`.
- Guardrail greps found no inline runtime `FEATURE_*` reads outside `src/lib/feature-flags.ts`; gateway and deferred-boundary matches in the implementation diff are documentation guardrails, not new runtime coupling.
- Open-file/process cleanup check under Codex PID 53107 found only the baseline MCP helper set (`repoprompt_cli`, Jira issue link, GitHub inline comment, PAL, Tavily, mcp-ical, QMD bridge, Computer Use) and no lingering Spec 002 dev server, Playwright worker, or build/test process.

### Post Review Remediation Evidence

- Draft PR #16 opened at https://github.com/racecraft-lab/mission-control/pull/16.
- Initial PR review check found no human comments and no review threads.
- GitHub Actions posted a screenshot-drift reminder; the opt-in `run-visual-diff` workflow was triggered for verification.
- Final GitHub check poll passed: CodeQL, Screenshot Drift Check, visual diff, and quality-gate.
- Retrospective artifact: `specs/002-product-line-switcher/retrospective.md`.

---

## Lessons Learned

### What Worked Well

- Keeping the Product Line switcher behind tenant/facility-controlled feature flags let the existing aggregate Facility view keep working while the scoped UI, REST filters, and SSE filters were added.
- A single scope resolver for headers, query params, and JSON bodies kept duplicate-carrier, malformed-carrier, unauthorized, and Facility-aggregate behavior consistent across routes.

### Challenges Encountered

- Several legacy routes had embedded `workspace_id` assumptions and required route-local review to preserve legacy flag-off behavior while adding explicit selected-scope enforcement.
- The implementation completed core behavior before all expanded generated standalone coverage files were added; keeping Phase 7 open until those files landed prevented overclaiming and made the recovery pass straightforward.

### Patterns to Reuse

- Treat Facility as the aggregate scope and Product Line as the selectable workspace scope in every API, event stream, cache key, and visible label.
- When generated task coverage expands beyond the implementation pass, leave Phase 7 open, record the exact unchecked coverage backlog, then close it only after those tasks and full verification pass.

---

## Project Structure Reference

```text
racecraft-mission-control/
|-- src/lib/feature-flags.ts                 # New SPEC-002 feature flag helper
|-- src/types/product-line.ts                # New ProductLine alias/type surface
|-- src/store/index.ts                       # Product Line scope slice, validation, cache/URL transition, and cross-tab sync
|-- src/components/layout/header-bar.tsx     # Header integration and terminology fix
|-- src/components/layout/workspace-switcher.tsx
|-- src/components/modals/project-manager-modal.tsx
|-- src/components/panels/                   # Mode-sensitive and Facility/global panel surfaces
|-- src/components/chat/                     # DB chat message/conversation surfaces
|-- src/app/api/                             # REST and SSE scoping surfaces
|-- messages/*.json                          # Localized header/switcher strings and aria labels
|-- tsconfig.spec-strict.json                # Strict scope includes new TS/TSX modules
|-- eslint.config.mjs                        # Strict lint scope includes new TS/TSX modules
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
