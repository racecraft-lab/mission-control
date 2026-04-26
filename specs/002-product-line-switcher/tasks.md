# Tasks: SPEC-002 Product-Line Switcher and activeWorkspace Scoping

**Input**: Design documents from `/specs/002-product-line-switcher/`
**Prerequisites**: `plan.md`, `spec.md`, `data-model.md`, `contracts/`, `research.md`, `quickstart.md`

**Tests**: TDD is explicitly requested; write or update focused Vitest and Playwright tests before implementation where feasible.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

**Implementation note**: Completed checkboxes reflect implemented code or equivalent repo-native verification evidence recorded in `quickstart.md`, `research.md`, and `docs/ai/specs/SPEC-002-workflow.md`.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify the feature workspace, establish scope evidence, and record the live route matrix before any implementation tasks.

- [x] T001 Record the SPEC-002 worktree and branch verification evidence in `specs/002-product-line-switcher/research.md` and `specs/002-product-line-switcher/quickstart.md`
- [x] T002 [P] Capture the live API route matrix for SPEC-002 scope in `specs/002-product-line-switcher/research.md` using `src/app/api/**/route.ts` discovery, including `/api/search`, task queue/outcomes/regression, project routes, activities, notifications, status/dashboard, audit, system-monitor, and `/api/events`
- [x] T003 [P] Review the current baseline test and snapshot counts in `specs/002-product-line-switcher/quickstart.md` and note the flag-off regression target for `FEATURE_WORKSPACE_SWITCHER=0`

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the shared feature-flag, scope, and strict-scope testing primitives required by every user story.

- [x] T004 [P] Create `src/lib/feature-flags.ts` with `resolveFlag(name, ctx)` and workspace-context resolution from `workspaces.feature_flags` without any inline `process.env.FEATURE_*` reads outside this module
- [x] T005 [P] Create `src/types/product-line.ts` with the discriminated `ProductLine`/Facility scope types, `scopeKey` helpers, and persisted payload shape for `mc:active-workspace:v1`
- [x] T006 [P] Create `src/components/layout/workspace-switcher.tsx` with the listbox shell, selected-state semantics, and localized Facility/Product Line copy hooks
- [x] T007 Update `tsconfig.spec-strict.json` so `src/components/layout/workspace-switcher.tsx`, `src/types/product-line.ts`, and `src/lib/feature-flags.ts` are included in strict-scope type coverage
- [x] T008 Update `eslint.config.mjs` so the three strict-scope modules are linted with the SPEC-002 guardrails
- [x] T009 Add strict-scope feature-flag and workspace-scope regression tests in `src/lib/__tests__/feature-flags.test.ts` and `src/store/product-line-scope.test.ts`
- [x] T010 Add a bootstrapping harness test in `src/store/workspace-init.test.ts` that proves `FEATURE_WORKSPACE_SWITCHER` resolves from authenticated workspace context and env `1` does not force normal `FEATURE_*` flags on

## Phase 3: User Story 1 - Preserve Existing Single-Workspace Behavior (Priority: P1)

**Goal**: Keep the flag-off experience byte-compatible, preserve baseline counts, and prevent any new switcher behavior from appearing when the feature is disabled.

**Independent Test**: Run the flag-off regression suite and verify no new switcher UI appears, no snapshots change, and the recorded baseline counts remain intact.

### Tests for User Story 1

- [x] T011 [P] [US1] Add flag-off regression coverage in `tests/workspace-switcher-flag-off.spec.ts` for unchanged header behavior, unchanged single-workspace navigation, and unchanged snapshots
- [x] T012 [P] [US1] Add Vitest regression coverage in `src/store/workspace-flag-off.test.ts` proving the legacy single-workspace path remains active when `FEATURE_WORKSPACE_SWITCHER=0`

### Implementation for User Story 1

- [x] T013 [US1] Update `src/components/layout/header-bar.tsx` to keep the existing header context when the switcher flag is off and to avoid any new workspace terminology
- [x] T014 [US1] Update `src/store/index.ts` so the flag-off path preserves current active workspace behavior without introducing Product Line scope state
- [x] T015 [US1] Update `specs/002-product-line-switcher/quickstart.md` with the exact flag-off verification steps and the baseline test-count evidence target

## Phase 4: User Story 2 - Switch Between Facility and Product Line Views (Priority: P1)

**Goal**: Introduce the scoped Product Line state model, safe persistence/hydration, cache and URL ownership, cross-tab sync, and Facility/Product Line transition behavior.

**Independent Test**: Select Facility and a Product Line workspace, reload, open a second tab, and verify the selected scope persists, validates, and converges without stale state leakage.

### Tests for User Story 2

- [x] T016 [P] [US2] Add Vitest coverage in `src/store/set-active-product-line.test.ts` for `setActiveProductLine(productLine | null, options)`, scope validation, and stale persisted-scope rejection
- [x] T017 [P] [US2] Add Vitest coverage in `src/store/product-line-persistence.test.ts` for `localStorage` hydration, wrong-tenant rejection, malformed payload rejection, and real `facility` row rejection
- [x] T018 [P] [US2] Add Vitest coverage in `src/store/product-line-broadcast.test.ts` for `BroadcastChannel` scope sync, tenant/user/session guards, version ordering, and unavailable-channel fallback
- [x] T019 [P] [US2] Add Vitest coverage in `src/store/product-line-cache-url.test.ts` for `scopeKey` request/cache/URL ownership, invalid scope reset, unowned URL entity-param stripping, stale in-flight response invalidation, and stale optimistic mutation completion rejection
- [x] T020 [P] [US2] Add Playwright coverage in `tests/product-line-cross-tab.spec.ts` for same-tenant cross-tab convergence and duplicate scope updates

### Implementation for User Story 2

- [x] T021 [US2] Implement the Product Line scope slice and `setActiveProductLine(productLine | null, options)` wiring in `src/store/index.ts`
- [x] T022 [US2] Implement persistence, hydration validation, and scope-version handling for `mc:active-workspace:v1` in `src/store/index.ts`
- [x] T023 [US2] Implement `scopeKey` ownership for request, cache, and URL state in `src/store/index.ts` and the supporting callers that consume the active scope, including invalid scoped URL reset and stripping entity params whose Facility/Product Line ownership cannot be proven
- [x] T024 [US2] Implement guarded `BroadcastChannel` publish/subscribe handling in `src/store/index.ts` so scope changes converge across tabs without crashes when the channel is unavailable
- [x] T025 [US2] Implement the scope transition invalidation path in `src/store/index.ts` so incompatible `activeProject`, selected task, selected agent, selected project, selected conversation, scoped modal, filter, and draft state clears on Facility/Product Line changes unless keyed by `scopeKey`
- [x] T026 [US2] Update `src/app/api/workspaces/route.ts` and `src/app/api/workspaces/[id]/route.ts` to validate the selected scope against authenticated workspace context before Product Line data renders

## Phase 5: User Story 3 - Switcher UI, Header Terminology, and Localized Copy (Priority: P1)

**Goal**: Present a responsive, accessible Facility/Product Line switcher with localized strings and correct header terminology.

**Independent Test**: Open the header at desktop and 320/375/390 px widths, verify the switcher remains visible, listbox semantics are correct, and the copy uses Facility/Product Line terminology only.

### Tests for User Story 3

- [x] T027 [P] [US3] Add component tests in `src/components/layout/workspace-switcher.test.tsx` for one synthetic Facility option, selected-state styling, and listbox option semantics
- [x] T028 [P] [US3] Add Playwright accessibility coverage in `tests/workspace-switcher-a11y.spec.ts` for keyboard navigation, Escape/outside-click close, and trigger focus return
- [x] T029 [P] [US3] Add Playwright responsive coverage in `tests/workspace-switcher-responsive.spec.ts` for 320/375/390 px header visibility and truncation behavior
- [x] T030 [P] [US3] Add a grep-based guard in `src/components/layout/header-bar-terminology.test.ts` that fails if `src/components/layout/header-bar.tsx` labels the context as "Workspace"

### Implementation for User Story 3

- [x] T031 [US3] Implement the responsive workspace switcher UI in `src/components/layout/workspace-switcher.tsx` with Facility/Product Line listbox behavior, loading/empty/error states, and no card-like wrapper
- [x] T032 [US3] Update `src/components/layout/header-bar.tsx` to render the switcher in the left header context cluster on desktop and keep the compact trigger visible on mobile
- [x] T033 [US3] Add localized Facility/Product Line, loading, empty, error, and aria-label strings in `messages/en.json` and the other affected `messages/*.json` files

## Phase 6: User Story 4 - REST Scoping and Authorization Across the Route Matrix (Priority: P1)

**Goal**: Enforce explicit Facility/Product Line authorization across the route matrix, including both-params rejection, unauthorized rejection, and real `facility` row rejection.

**Independent Test**: Exercise the live route matrix with explicit scope inputs and verify list, detail, mutation, and search routes reject invalid or unauthorized scope combinations.

### Tests for User Story 4

- [x] T034 [P] [US4] Add route-contract tests in `tests/product-line-scope-api.spec.ts` for `workspace_id`, `workspace_scope=facility`, both-params `400`, unauthorized `403`, and real `facility` row `400`
- [x] T035 [P] [US4] Add route-matrix regression tests in `tests/product-line-scope-matrix.spec.ts` covering every T002-discovered route in the concrete matrix, including `/api/tasks`, `/api/projects`, `/api/agents`, `/api/quality-review`, `/api/chat`, `/api/search`, `/api/activities`, `/api/notifications`, `/api/status`, `/api/audit`, `/api/system-monitor`, and `/api/events`; for each scoped route assert authorized Product Line or Facility behavior plus unauthorized scope rejection, both-params `400`, real `facility` row as Product Line `400`, and flag-OFF legacy omission where applicable
- [x] T036 [P] [US4] Add route-discovery traceability tests in `tests/product-line-route-discovery.spec.ts` that assert the exact in-scope route list includes the live `src/app/api/**/route.ts` files discovered in T002

### Implementation for User Story 4

- [x] T037 [US4] Update `src/app/api/tasks/route.ts`, `src/app/api/tasks/[id]/route.ts`, `src/app/api/tasks/[id]/comments/route.ts`, `src/app/api/tasks/[id]/broadcast/route.ts`, `src/app/api/tasks/[id]/branch/route.ts`, `src/app/api/tasks/queue/route.ts`, `src/app/api/tasks/outcomes/route.ts`, and `src/app/api/tasks/regression/route.ts` to authorize the accepted scope before querying
- [x] T038 [US4] Update `src/app/api/projects/route.ts`, `src/app/api/projects/[id]/route.ts`, `src/app/api/projects/[id]/agents/route.ts`, and `src/app/api/projects/[id]/tasks/route.ts` for explicit scope authorization or resource-id authorization
- [x] T039 [US4] Update `src/app/api/agents/route.ts`, `src/app/api/agents/[id]/route.ts`, and all agent subroutes under `src/app/api/agents/[id]/*` plus `src/app/api/agents/comms/route.ts`, `src/app/api/agents/evals/route.ts`, `src/app/api/agents/message/route.ts`, `src/app/api/agents/optimize/route.ts`, `src/app/api/agents/register/route.ts`, and `src/app/api/agents/sync/route.ts` for scoped authorization
- [x] T040 [US4] Update `src/app/api/quality-review/route.ts`, `src/app/api/chat/messages/route.ts`, `src/app/api/chat/messages/[id]/route.ts`, `src/app/api/chat/conversations/route.ts`, `src/app/api/search/route.ts`, `src/app/api/activities/route.ts`, `src/app/api/notifications/route.ts`, `src/app/api/notifications/deliver/route.ts`, `src/app/api/status/route.ts`, `src/app/api/audit/route.ts`, and `src/app/api/system-monitor/route.ts` to enforce the accepted Facility/Product Line contract

## Phase 7: User Story 5 - SSE Scoping, Panel Wiring, and Boundary Checks (Priority: P1/P2)

**Goal**: Scope `/api/events`, wire mode-sensitive panels to the selected scope, and protect Facility/global surfaces from stale or unauthorized Product Line data.

**Independent Test**: Change scope, reconnect the event stream, and verify panel surfaces and boundary checks respect the selected Facility/Product Line mode without leaking stale data.

### Tests for User Story 5

- [x] T041 [P] [US5] Add SSE contract tests in `tests/product-line-events.spec.ts` for authorized Product Line filtering, Facility aggregation, real `facility` row as Product Line setup rejection, missing/mismatched `workspace_id`, EventSource close/reconnect-on-scope-change, the explicit whitelisted global event types, and `eventBus` producer coverage proving every non-allowlisted workspace-scoped event type includes `workspace_id` at the broadcast source or through a typed event-bus helper
- [x] T042 [P] [US5] Add panel-wiring tests in `src/components/panels/product-line-panels.test.ts` for task board, agent squad, project manager modal, quality-review, and chat surfaces honoring scope; agent squad coverage must prove Facility globals -> Product Line -> Department -> Agent grouping, duplicate global/local display names do not merge stats, and ambiguous mutations target ids
- [x] T043 [P] [US5] Add boundary tests in `src/components/panels/facility-global-boundaries.test.ts` for `src/components/panels/skills-panel.tsx`, local/gateway session and transcript surfaces such as `src/components/panels/session-details-panel.tsx` and `src/components/chat/chat-panel.tsx`, and Facility/global aggregate panels such as `src/components/panels/notifications-panel.tsx`, `src/components/panels/system-monitor-panel.tsx`, and `src/components/panels/audit-trail-panel.tsx` remaining Facility/global

### Implementation for User Story 5

- [x] T044 [US5] Update `src/app/api/events/route.ts` and the relevant `eventBus` broadcast producers or typed event-bus helper so selected Product Line streams filter by authorized workspace, Facility streams aggregate authorized tenant events, real `facility` row setup is rejected as Product Line scope, missing or mismatched scoped payloads are rejected, every non-allowlisted workspace-scoped broadcast includes `workspace_id` before streaming, and only the documented global connection/system event allowlist may omit `workspace_id`
- [x] T045 [US5] Update `src/components/panels/task-board-panel.tsx`, `src/components/panels/agent-squad-panel-phase3.tsx`, `src/components/modals/project-manager-modal.tsx`, and the quality-review/chat surfaces under `src/components/panels` and `src/components/chat` to honor the selected scope; keep agent mutations id-based when global/local display names collide and do not merge Product Line-local stats into global rows
- [x] T046 [US5] Update `src/components/panels/skills-panel.tsx`, local/gateway session and transcript surfaces, and Facility/global aggregate panels only if failing SPEC-002 tests prove they leak Product Line ownership or stale aggregate behavior

## Phase 8: Final Phase - Polish & Cross-Cutting Concerns

**Purpose**: Finish regression proof, docs alignment, and verification artifacts without expanding the SPEC-002 scope.

- [x] T047 [P] Update `specs/002-product-line-switcher/spec.md`, `specs/002-product-line-switcher/plan.md`, and `specs/002-product-line-switcher/quickstart.md` with final traceability notes that map the terminology table, SC-003, SC-014, SC-015/V2-001, SC-016, P1-AC12 through P1-AC16, deferred boundaries, and the T002 route matrix back to the generated tasks
- [x] T048 [P] Add a prohibited-drift grep check in `specs/002-product-line-switcher/quickstart.md` that guards against inline `process.env.FEATURE_*` reads outside `src/lib/feature-flags.ts`
- [x] T049 [P] Add a final verification checklist in `specs/002-product-line-switcher/quickstart.md` for flag-off regression, flag-on Facility bootstrap, REST, SSE, cross-tab sync, accessibility, and boundary behavior
- [x] T050 Run the SPEC-002 verification command set from `specs/002-product-line-switcher/quickstart.md` and record the results in `specs/002-product-line-switcher/research.md`

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup completion and blocks all story work
- **User Stories (Phases 3-7)**: Depend on Foundational completion
- **Polish (Phase 8)**: Depends on the intended user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational completion and should stay flag-off safe
- **User Story 2 (P1)**: Can start after Foundational completion and is the core scope/state increment
- **User Story 3 (P1)**: Can start after Foundational completion and depends on the same scope primitives as US2
- **User Story 4 (P1)**: Can start after Foundational completion and depends on the scope contract from US2
- **User Story 5 (P1/P2)**: Can start after Foundational completion and consumes the scope contract and API scoping from US2 and US4

### Within Each User Story

- Tests must be written before implementation where feasible
- Scope-state and contract primitives must land before UI and route consumers
- Each story should remain independently testable before moving to the next priority

### Parallel Opportunities

- T002, T003, T004, T005, T006, T007, T008, T009, and T010 can proceed in parallel where they touch different files
- T011 and T012 can proceed in parallel because they cover separate test surfaces
- T016, T017, T018, T019, and T020 can proceed in parallel because they cover separate scope-state surfaces
- T027, T028, T029, and T030 can proceed in parallel because they cover separate UI/test surfaces
- T034, T035, and T036 can proceed in parallel because they cover separate route-contract evidence surfaces
- T041, T042, and T043 can proceed in parallel because they cover separate SSE, panel, and boundary surfaces

## Parallel Example: User Story 2

```bash
Task: "Add Vitest coverage in `src/store/set-active-product-line.test.ts` for `setActiveProductLine(productLine | null, options)`, scope validation, and stale persisted-scope rejection"
Task: "Add Vitest coverage in `src/store/product-line-persistence.test.ts` for `localStorage` hydration, wrong-tenant rejection, malformed payload rejection, and real `facility` row rejection"
Task: "Add Vitest coverage in `src/store/product-line-broadcast.test.ts` for `BroadcastChannel` scope sync, tenant/user/session guards, version ordering, and unavailable-channel fallback"
Task: "Add Vitest coverage in `src/store/product-line-cache-url.test.ts` for `scopeKey` request/cache/URL ownership and stale in-flight response invalidation"
```

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2
2. Implement User Story 1 to prove the feature stays off cleanly
3. Implement User Story 2 to introduce the core scoped state model
4. Validate before moving to UI, REST, and SSE expansion

### Incremental Delivery

1. Setup and foundational primitives
2. Flag-off regression safety
3. Scope state and cross-tab sync
4. UI and terminology
5. REST and SSE authorization
6. Panel wiring and boundary protection
7. Final verification and docs alignment
