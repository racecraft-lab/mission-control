# Research: SPEC-002 Product-Line Switcher and activeWorkspace Scoping

## Decision 1: Feature flags resolve from workspace JSON with an env kill-switch

- Decision: Implement `resolveFlag(name, ctx)` so `workspaces.feature_flags` is the normal source of truth, `NULL` means OFF, `FEATURE_* = 0` forces OFF, and `FEATURE_* = 1` does not force ON except for the roadmap-approved pilot exception.
- Rationale: This preserves zero-regression behavior while allowing explicit workspace opt-in and keeps the switcher gate deterministic.
- Alternatives considered: Direct `process.env.FEATURE_*` branching, but that bypasses workspace data and weakens the hard-default-OFF policy.

## Decision 2: Product Line scope remains separate from tenant/facility auth context

- Decision: Model Facility as the aggregate user-facing scope and keep `activeTenant` independent from Product Line selection, with `activeWorkspace = null` used only as compatibility storage for Facility after initialization.
- Rationale: The feature needs a stable auth/data boundary without mutating tenant identity, and this matches the clarified spec semantics.
- Alternatives considered: Reusing `activeWorkspace` as the source of truth for tenant context, but that would blur boundaries and risk access leakage.

## Decision 3: Switcher bootstrap uses authenticated workspace context, not the selected scope

- Decision: Resolve `FEATURE_WORKSPACE_SWITCHER` from the authenticated `/api/workspaces` context before Product Line selection is applied.
- Rationale: The switcher chrome must be available or hidden based on tenant/facility authorization, not on a later client-side scope choice.
- Alternatives considered: Evaluating the flag from the current `activeWorkspace`, but that would create circular behavior and hide the switcher during initialization.

## Decision 4: Cross-tab scope sync uses BroadcastChannel with guarded fallback

- Decision: Use `BroadcastChannel('mc:active-workspace')` for accepted scope updates, include tenant/user/session guards, monotonic version checks, stale-version rejection, and a guarded fallback when the API is unavailable. The fallback must not crash or widen scope: the initiating tab keeps its accepted scope, other tabs converge only after manual reload or their next supported initialization path.
- Rationale: This provides fast synchronization without coupling the state model to a heavier persistence mechanism.
- Alternatives considered: Polling localStorage or server state, but both are slower and less precise for same-session tab sync.

## Decision 4a: Persist only the Product Line scope slice

- Decision: Wrap only the Product Line scope slice with Zustand persistence using storage key `mc:active-workspace:v1`; persist tenant id, Product Line id or Facility null, payload version, and accepted scope version, but not unrelated store slices, selections, filters, modals, drafts, agents, tasks, or projects.
- Rationale: Zustand persistence uses the configured `name` as the storage key and supports `partialize` to restrict stored fields, so limiting the persisted payload reduces stale-state blast radius while preserving the selected Product Line across sessions.
- Alternatives considered: Persisting the whole store, but that would retain unrelated UI and data state across scope changes and conflict with the explicit invalidation contract.

## Decision 5: REST, SSE, and URL ownership are scope-keyed and reject unsafe Facility rows

- Decision: Use `scopeKey = tenantId + ":" + ("facility" | productLineId)` for request/cache ownership and reject the real `workspaces.slug='facility'` row as Product Line `workspace_id` in REST, URL parsing, and SSE setup.
- Rationale: This prevents duplicate aggregate semantics and blocks cross-scope data leakage.
- Alternatives considered: Treating the real `facility` row as equivalent to aggregate Facility, but that makes authorization and UI state ambiguous.

## Decision 6: Mode-sensitive panels are explicitly enumerated

- Decision: Scope only the roadmap-listed mode-sensitive surfaces and keep skills, local/gateway sessions/transcripts, and other global surfaces Facility-only.
- Rationale: This keeps Phase 1 narrow and avoids accidentally claiming downstream ownership.
- Alternatives considered: Broadly wiring every panel to Product Line scope, but that would exceed the spec and create churn outside the intended surface area.

## Decision 7: Validation emphasizes regression and scope boundaries

- Decision: Prioritize Vitest coverage for flag resolution, store transitions, route authorization, SSE acceptance/rejection, and URL scope cleanup, plus Playwright coverage for the switcher UI and cross-tab behavior.
- Rationale: These tests directly verify the highest-risk behavior: zero regression, no leakage, and consistent scope transitions.
- Alternatives considered: Relying only on manual spot checks, but that would leave the scope contract under-tested.

## Implementation Evidence: Worktree and Route Matrix

- Worktree: `/Users/fredrickgabelmann/Documents/Business_Documents/RSE_Documents/Projects/racecraft-mission-control/.worktrees/002-product-line-switcher`
- Branch: `002-product-line-switcher`
- Package manager: `pnpm` from `pnpm-lock.yaml`
- Route discovery command: `find src/app/api -path '*/route.ts' | sort`

SPEC-002 scoped route matrix implemented in this pass:

- Task routes: `src/app/api/tasks/route.ts`, `src/app/api/tasks/[id]/route.ts`, `src/app/api/tasks/[id]/comments/route.ts`, `src/app/api/tasks/[id]/broadcast/route.ts`, `src/app/api/tasks/[id]/branch/route.ts`, `src/app/api/tasks/queue/route.ts`, `src/app/api/tasks/outcomes/route.ts`, and `src/app/api/tasks/regression/route.ts`.
- Project routes: `src/app/api/projects/route.ts`, `src/app/api/projects/[id]/route.ts`, `src/app/api/projects/[id]/agents/route.ts`, and `src/app/api/projects/[id]/tasks/route.ts`.
- Agent routes: `src/app/api/agents/route.ts`, `src/app/api/agents/[id]/route.ts`, `src/app/api/agents/[id]/attribution/route.ts`, `src/app/api/agents/[id]/diagnostics/route.ts`, `src/app/api/agents/[id]/files/route.ts`, `src/app/api/agents/[id]/heartbeat/route.ts`, `src/app/api/agents/[id]/hide/route.ts`, `src/app/api/agents/[id]/keys/route.ts`, `src/app/api/agents/[id]/memory/route.ts`, `src/app/api/agents/[id]/soul/route.ts`, `src/app/api/agents/[id]/wake/route.ts`, `src/app/api/agents/comms/route.ts`, `src/app/api/agents/evals/route.ts`, `src/app/api/agents/message/route.ts`, `src/app/api/agents/optimize/route.ts`, `src/app/api/agents/register/route.ts`, and `src/app/api/agents/sync/route.ts`.
- Support routes: `src/app/api/quality-review/route.ts`, `src/app/api/chat/messages/route.ts`, `src/app/api/chat/messages/[id]/route.ts`, `src/app/api/chat/conversations/route.ts`, `src/app/api/search/route.ts`, `src/app/api/activities/route.ts`, `src/app/api/notifications/route.ts`, `src/app/api/notifications/deliver/route.ts`, `src/app/api/status/route.ts`, `src/app/api/audit/route.ts`, `src/app/api/system-monitor/route.ts`, `src/app/api/events/route.ts`, `src/app/api/workspaces/route.ts`, and `src/app/api/workspaces/[id]/route.ts`.

## Implementation Evidence: Verification Results

Recorded on 2026-04-26 after remediation of the two full-E2E regressions found in `/api/agents/message` and `/api/chat/conversations`:

- `pnpm typecheck`: passed.
- `pnpm build`: passed.
- `pnpm test`: passed, 106 files and 1037 tests.
- `pnpm lint`: passed with 0 errors and 11 warnings.
- `pnpm exec playwright test tests/product-line-scope-api.spec.ts`: passed, 2 tests.
- `pnpm exec playwright test tests/injection-guard-endpoints.spec.ts tests/limit-caps.spec.ts`: passed, 15 tests.
- `pnpm test:e2e`: passed, 526 tests.
- Inline feature-flag drift guard returned no matches: `rg -n 'process\.env\.FEATURE_[A-Z0-9_]+' src --glob '!src/lib/feature-flags.ts'`.

Remediation notes:

- `/api/agents/message` now scans prompt-injection content before recipient lookup so unsafe content returns `422` even for an invalid agent name.
- `/api/chat/conversations` now uses an unaliased workspace predicate for the last-message lookup, preserving the existing limit-cap route behavior.
- `src/app/api/workspaces/route.ts` and `src/app/api/workspaces/[id]/route.ts` validate explicit selected-scope carriers against authenticated tenant context without breaking legacy omitted-scope behavior.
