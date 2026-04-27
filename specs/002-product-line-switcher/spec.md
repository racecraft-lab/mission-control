# Feature Specification: Product Line Switcher and activeWorkspace Scoping

**Feature Branch**: `002-product-line-switcher`
**Created**: 2026-04-26
**Status**: Draft
**Input**: User description: "Create a specification for RC Factory Phase 1 in Mission Control."

## Clarifications

### Session 2026-04-26

- Q: What are the canonical scope terms and storage semantics? -> A: Facility is the user-facing aggregate; tenant is the auth/data boundary; runtime scope is discriminated Facility/Product Line even when `activeWorkspace = null` stores Facility compatibility state.
- Q: What transition path owns Facility/Product Line changes and hydration? -> A: Every Facility/Product Line change uses `setActiveProductLine(productLine | null, options)`, validates stale persisted Product Line ids after `/api/workspaces`, and renders Facility only after auth/workspace initialization.
- Q: How must the synthetic Facility option and real `facility` workspace row behave? -> A: The switcher renders exactly one synthetic Facility option, suppresses any real `workspaces.slug='facility'` aggregate duplicate, rejects that real row as Product Line scope in REST, URL, and SSE setup, and uses `workspace_scope=facility` for Facility aggregate.
- Q: How do global agents and scoped state behave across Product Line views? -> A: Global agents appear in Product Line views; duplicate global/local names mutate by id, and scope transitions clear incompatible active project, selections, modals, filters, and drafts unless keyed by `scopeKey`.
- Q: Which context enables `FEATURE_WORKSPACE_SWITCHER`? -> A: Bootstrap resolves the flag from authenticated tenant/facility context returned by `/api/workspaces`; selected Facility (`activeWorkspace = null`) is not a no-workspace flag context.
- Q: What is the REST scope parameter and error contract? -> A: Product Line requests use `workspace_id=<id>`; Facility requests use `workspace_scope=facility`; requests that include both `workspace_id` and `workspace_scope=facility` in the same request return `400` with `{ error }`, unauthorized workspace ids return `403` with `{ error }`, the real `facility` row as `workspace_id` returns `400` with `{ error }`, and omitted scope is accepted only as legacy behavior while `FEATURE_WORKSPACE_SWITCHER` is OFF.
- Q: Which API routes are in the Product Line scope matrix? -> A: The matrix includes task routes, project routes, agent root/detail/subroutes, quality-review, DB chat messages/conversations, search, activities, notifications, dashboard/status/audit/live-feed backing routes, system-monitor, and events.
- Q: How do scoped routes and `/api/events` prevent scope leaks? -> A: Routes authorize explicit Facility/Product Line scope server-side before querying or authorize by resource id joined back to the caller's tenant/workspace boundary; SPEC-002 adds authorized `/api/events` scope handling so Product Line streams filter by authorized workspace, Facility streams aggregate only authorized tenant/facility events, workspace-scoped events require `workspace_id`, Product Line clients also drop missing/mismatched scoped events as defense in depth, EventSource connections close and reconnect on scope changes, and only named global connection/system events may omit workspace scope.
- Q: How should the header label and responsive placement present Facility/Product Line context? -> A: The header context is not labeled "Workspace"; desktop renders the switcher in the left header context cluster, and the mobile compact trigger remains visible at 320/375/390 px within the fixed `h-14` header by using `min-w-0`, bounded max widths, and text truncation so search, notifications, language, theme, and account controls remain visible.
- Q: What switcher design and listbox semantics are required? -> A: The switcher uses existing design patterns with no icon library, no card-like wrapper, and no explanatory header copy; listbox content contains only selectable `option` rows, while loading/empty states are non-focusable `role="status"` content and error state is non-focusable `role="alert"` content.
- Q: How are new header and switcher strings localized? -> A: New strings follow existing `messages/*.json` patterns and include Facility, Product Line, loading, empty, error, and aria-label text.
- Q: Which global surfaces are excluded from Product Line counts? -> A: Skills and local/gateway sessions/transcripts remain Facility/global and are excluded from Product Line-specific counts.
- Q: What Playwright regression coverage is required? -> A: Flag-OFF Playwright snapshots remain unchanged, and flag-ON coverage includes switcher states, accessibility semantics, duplicate Facility prevention, and cross-tab behavior.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preserve Existing Single-Workspace Behavior (Priority: P1)

As an existing user, I can run Mission Control with the workspace switcher disabled and see the same behavior, baseline test coverage, and snapshots I see today.

**Why this priority**: Preserving the current experience is the primary safety requirement and prevents accidental regressions for all existing deployments.

**Independent Test**: Launch the product with the feature disabled and verify the visible workspace context, navigation behavior, saved state, baseline test counts, and Playwright snapshots remain unchanged from the current baseline.

**Acceptance Scenarios**:

1. **Given** the workspace switcher feature is disabled, **When** a user opens Mission Control, **Then** the app behaves as a single-workspace product with no new workspace-switcher behavior visible.
2. **Given** the workspace switcher feature is disabled, **When** a user navigates through the app, **Then** the active tenant context remains unchanged and no Product Line scoping state is introduced.
3. **Given** the feature is disabled, **When** the baseline verification suite runs, **Then** the existing pre-SPEC-002 Vitest and Playwright test counts are not reduced or skipped, and no Playwright snapshot update is required.

---

### User Story 2 - Switch Between Facility and Product Line Views (Priority: P1)

As a facility operator or department lead, I can switch between the Facility aggregate view and authorized Product Line workspaces while staying in the same tenant.

**Why this priority**: This is the core product value for Phase 1 and the basis for later Product Line features.

**Independent Test**: Select Facility and a Product Line workspace from the switcher and verify the visible data scope changes to the chosen context without changing tenant administration context.

**Acceptance Scenarios**:

1. **Given** an authorized user has both Facility and Product Line access, **When** they select Facility, **Then** the app shows the Facility aggregate context and global agents remain visible.
2. **Given** an authorized user has access to a Product Line workspace, **When** they select that workspace, **Then** the app shows only the data that belongs to that Product Line for the supported surfaces.
3. **Given** a real workspace named or sluggified as `facility`, **When** the switcher renders, **Then** the synthetic Facility aggregate entry appears only once and the real workspace does not create a duplicate aggregate option.
4. **Given** global and local agents share the same display name, **When** the user mutates an agent from a Product Line view, **Then** the mutation targets the selected agent id rather than resolving by name.
5. **Given** the feature is enabled and Facility scope is selected, **When** existing baseline tests run alongside new SPEC-002 tests, **Then** existing baseline assertions remain unchanged while new tests assert only Facility aggregate semantics introduced by SPEC-002.

---

### User Story 3 - Keep Scope Synchronized Across Tabs (Priority: P2)

As a multi-tab operator, I can change Product Line context in one tab and have other open tabs converge on the same selection.

**Why this priority**: Cross-tab consistency prevents operators from working in conflicting scopes and reduces confusion during task handoff.

**Independent Test**: Open two tabs for the same tenant, change the Product Line selection in one tab, and verify the other tab updates or reloads to the same selection.

**Acceptance Scenarios**:

1. **Given** two tabs are open for the same signed-in user, **When** the selected Product Line changes in one tab, **Then** the other tab receives the same active Product Line selection or reloads to it.
2. **Given** a tab receives a scope change for a different tenant or user, **When** the message is processed, **Then** the tab ignores the change.

---

### User Story 4 - Protect Tenant and Workspace Data Boundaries (Priority: P2)

As a tenant admin, I cannot use workspace-scoping requests to access another tenant's data or bypass authorized scope rules.

**Why this priority**: The new scope model must preserve access control and prevent data leakage across tenants or unauthorized workspaces.

**Independent Test**: Attempt to request tenant or workspace data outside the caller's authorization and verify the response is rejected.

**Acceptance Scenarios**:

1. **Given** a request names both a Facility scope and a Product Line workspace, **When** it is submitted, **Then** it is rejected as invalid.
2. **Given** a request names an unauthorized workspace, **When** it is submitted, **Then** it is rejected with no data returned from that workspace.
3. **Given** a request, URL scope, or SSE setup attempts to use the real `facility` row as a Product Line workspace, **When** it is submitted, **Then** it is rejected rather than treated as the aggregate Facility selection.

---

### Edge Cases

- Switching away from a Product Line workspace clears incompatible `activeProject`, selected task, selected agent, selected project, selected conversation, scoped filters, scoped drafts, and scoped modals unless that state is explicitly keyed by the new `scopeKey`.
- If a stored Product Line scope no longer exists or is no longer authorized, the app clears it before scoped data renders and resets to the Facility aggregate view after auth/workspace initialization completes.
- If the persisted Product Line payload is malformed, from an unsupported version, from a different tenant, or points at the real `facility` row, the app rejects it before scoped data renders and resets to Facility after auth/workspace initialization.
- If `activeTenant` changes, the app clears the active Product Line scope, ignores persisted Product Line values from the previous tenant, derives a new `scopeKey`, and renders no scoped Product Line data until the new tenant's `/api/workspaces` response authorizes it.
- If BroadcastChannel support is unavailable, the app continues without crashing; same-tab state remains authoritative, other tabs converge only after manual reload or their next supported initialization path, and no stale cross-tab message is assumed delivered.
- If the user has no Product Line access, the switcher still exposes the Facility aggregate entry when the tenant context allows it.
- If selected Facility is represented internally as `activeWorkspace = null`, feature flag resolution still uses the authenticated tenant/facility context from `/api/workspaces` rather than treating the request as a no-workspace context.
- If a selected Product Line client receives an SSE event without `workspace_id` or with a different `workspace_id`, the client drops that event unless the event type is explicitly whitelisted as global.
- If Facility/Product Line scope changes while an EventSource connection is active, the client reconnects with the new authorized scope before consuming further scoped events.
- If the header is rendered on 320 px, 375 px, or 390 px mobile viewports, the compact Facility/Product Line trigger remains visible within the fixed `h-14` header and cannot push search, notifications, language, theme, or account controls out of view.
- If the switcher is loading, empty, or failed, those rows are exposed only as non-focusable status or alert content and cannot be selected like Product Line or Facility options.
- If `/api/workspaces` fails while the switcher is enabled, the popover shows a non-focusable workspace-list failure `role="alert"` that is distinct from the empty Product Line state; the empty state means the workspace list loaded successfully and only Facility is selectable.
- If a previously selected Product Line becomes unauthorized after `/api/workspaces` validation, the app resets to Facility before scoped data renders and exposes a non-focusable unauthorized-selection `role="alert"` distinct from the generic workspace-list failure state.
- If a request, response, or optimistic mutation completion was started under an older `scopeKey`, the app ignores the completion once the active `scopeKey` differs and must not apply stale data into the new Facility/Product Line view.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST preserve current behavior when the workspace switcher feature is disabled.
- **FR-002**: The system MUST expose a Product Line switcher only when `FEATURE_WORKSPACE_SWITCHER` resolves as enabled from the authenticated tenant/facility flag context returned by `/api/workspaces`.
- **FR-003**: The system MUST treat Facility as the canonical user-facing aggregate selection for the authenticated tenant/data boundary and MUST keep it distinct from any real workspace record.
- **FR-004**: The system MUST render exactly one synthetic Facility option in the workspace switcher, even if a real workspace uses the `facility` name or slug, and MUST suppress any real `workspaces.slug='facility'` row from aggregate selection.
- **FR-005**: The system MUST maintain Product Line scope separately from tenant administration context.
- **FR-006**: The system MUST use `setActiveProductLine(productLine | null, options)` as the required public transition API for every Facility/Product Line change, including switcher selection, hydration, URL adoption, invalid-scope reset, and cross-tab acceptance.
- **FR-007**: The system MUST persist only the Product Line scope slice between sessions with Zustand persistence key `mc:active-workspace:v1`, and MUST validate or clear stale, malformed, wrong-version, wrong-tenant, unauthorized, or real `facility` row Product Line ids after `/api/workspaces` before scoped data renders.
- **FR-008**: The system MUST synchronize Product Line scope across open tabs for the same signed-in tenant and user, while ignoring messages that do not match the active tenant or user/session context, rejecting stale message versions, and continuing with a non-crashing manual-reload convergence path when BroadcastChannel is unavailable.
- **FR-009**: The system MUST clear incompatible `activeProject`, selected task, selected agent, selected project, selected conversation, scoped modal, filter, and draft state when Product Line scope changes unless that state is explicitly keyed to the new `scopeKey`.
- **FR-010**: The system MUST scope supported data surfaces to the selected Facility or Product Line context without allowing one context to leak data from another.
- **FR-011**: The system MUST reject workspace-scoping requests with explicit status codes and the repo's `{ error }` response shape: requests combining `workspace_id` and `workspace_scope=facility` return `400`, unauthorized workspace ids return `403`, and the real `workspaces.slug='facility'` row submitted as Product Line `workspace_id` returns `400`.
- **FR-012**: The system MUST continue to treat skills and local/gateway sessions/transcripts as Facility/global only for this phase and MUST exclude them from Product Line-specific counts.
- **FR-013**: The system MUST represent runtime scope as discriminated Facility or Product Line state, even if `activeWorkspace = null` remains the compatibility storage representation for Facility.
- **FR-014**: The system MUST start first load in Facility only after auth/workspace initialization; `activeWorkspace = null` before initialization MUST NOT widen access or act as a no-workspace flag context.
- **FR-015**: The system MUST use `workspace_scope=facility` for Facility aggregate REST, URL, and SSE setup, MUST use Product Line `workspace_id=<id>` only for authorized non-Facility Product Line workspaces, and MUST treat omitted scope as legacy-only behavior when `FEATURE_WORKSPACE_SWITCHER` is OFF.
- **FR-016**: The system MUST show global agents across Product Line views, and mutations involving duplicate global/local agent names MUST target agents by id rather than by display name.
- **FR-017**: The system MUST apply the Product Line scope matrix to task routes (`/api/tasks`, `/api/tasks/[id]`, `/api/tasks/[id]/comments`, `/api/tasks/[id]/broadcast`, `/api/tasks/[id]/branch`, `/api/tasks/queue`, `/api/tasks/outcomes`, `/api/tasks/regression`), project routes (`/api/projects`, `/api/projects/[id]`, `/api/projects/[id]/agents`, `/api/projects/[id]/tasks`), agent root/detail/subroutes, `/api/quality-review`, DB-backed `/api/chat/messages` and `/api/chat/conversations` routes, `/api/search`, `/api/activities`, `/api/notifications`, dashboard/status/audit/live-feed backing routes, `/api/system-monitor`, and `/api/events`.
- **FR-018**: Each route in the scope matrix MUST either accept and authorize explicit Facility/Product Line scope parameters server-side before querying or authorize access by joining the requested resource id back to the caller's tenant/workspace boundary.
- **FR-019**: `/api/events` MUST authorize the requested SSE scope before subscribing or streaming, MUST support authorized Product Line filtering and authorized Facility aggregation, MUST require `workspace_id` on workspace-scoped events, MUST drop missing or mismatched workspace events for selected Product Line clients as defense in depth, MUST reconnect EventSource when Facility/Product Line scope changes, and MUST allow only explicitly whitelisted global connection/system event types without workspace scope.
- **FR-020**: The system MUST present header tenant/facility context using Facility and Product Line terminology and MUST NOT label the context as "Workspace" in the new header or switcher UI.
- **FR-021**: The desktop switcher MUST render in the left header context cluster, and the mobile compact trigger MUST remain visible at 320 px, 375 px, and 390 px within the fixed `h-14` header by using `min-w-0`, bounded max widths, and text truncation so search, notifications, language, theme, and account controls remain visible.
- **FR-022**: The switcher MUST use existing Mission Control design patterns with no added icon library, no card-like wrapper, and no explanatory header copy; Facility and selected Product Line trigger/option states MUST be visually distinct through the selected value, selected-row treatment, and existing muted/border/background states rather than through additional instructional chrome.
- **FR-023**: The switcher listbox MUST expose only selectable Facility/Product Line rows as focusable `option` rows with selected state and `aria-selected`; keyboard focus MUST use either roving focus or `aria-activedescendant`; Arrow Up/Down, Home/End, Enter/Space selection, Escape close, outside-click close, and trigger focus return after close MUST be specified behavior. Loading and empty rows MUST be non-focusable `role="status"` content, and workspace-list failure, unauthorized-selection, and error rows MUST be non-focusable `role="alert"` content outside the selectable option set.
- **FR-024**: New header and switcher strings MUST be localized through the existing `messages/*.json` patterns, including Facility, Product Line, loading, empty, error, and aria-label strings.

### Panel Taxonomy

- **Mode-sensitive panels**: task board, agent squad, project manager modal, quality-review surfaces, and DB-backed chat message/conversation surfaces MUST apply selected Product Line filtering when `scope.kind = "productLine"` and Facility aggregate behavior when `scope.kind = "facility"`.
- **Facility/global surfaces**: live feed, notifications, dashboard/status, system monitor, audit trail, skills, and local/gateway sessions/transcripts remain Facility/global in the panel UX for SPEC-002 and MUST NOT be presented as Product Line-owned panels.
- **Cross-cutting backing routes**: `/api/search`, `/api/activities`, `/api/notifications`, dashboard/status/audit/live-feed backing routes, `/api/system-monitor`, and `/api/events` still follow the Product Line scope matrix authorization contract where listed in FR-017/FR-018/FR-019 so Facility/global panels do not leak unauthorized Product Line data.

### Deferred Boundaries

- SPEC-002 MUST NOT implement downstream Aegis ownership semantics beyond existing global-agent visibility and id-based mutation safety.
- SPEC-002 MUST NOT implement task pipeline engines, successor task creation, routing rules, `ready_for_owner` state/lane/label behavior, area-label routing, artifact/disposition publishing, or governance enforcement.
- SPEC-002 MUST NOT implement Product Line skill ownership, skill filtering, skill assignment, skill permissioning, skill CRUD, or session/transcript-to-workspace mapping.
- SPEC-002 MUST NOT implement tenant-routed gateway selection or multi-facility tenant modeling; local/gateway sessions and transcripts remain Facility/global.
- New tests MUST assert SPEC-002 feature-flag, Facility/Product Line scope, switcher, REST/SSE, cache/URL, and state-transition behavior only, and MUST NOT encode assumptions owned by SPEC-003 or later roadmap specs.

### Key Entities *(include if feature involves data)*

- **Tenant**: The authenticated account and data boundary for a Facility; it remains stable while Product Line scope changes.
- **Facility**: The canonical user-facing aggregate view for the authenticated tenant, represented in compatibility storage as `activeWorkspace = null` only after auth/workspace initialization.
- **Product Line Workspace**: An authorized non-Facility workspace that represents a scoped Product Line view; the real `workspaces.slug='facility'` row is not a valid Product Line workspace.
- **Active Product Line Scope**: The discriminated runtime selection state with Facility and Product Line modes that controls which view and data scope the user sees.
- **Scope Key**: A request/cache ownership key derived from the authenticated tenant and current Facility/Product Line mode; state may survive transitions only when explicitly keyed by this value.
- **Workspace Flags**: Per-workspace feature settings returned through authenticated `/api/workspaces` context that determine whether the switcher is available.

### Terminology and Traceability Alignment

| Term or Marker | SPEC-002 Meaning | Alignment Source |
|---|---|---|
| Facility | User-facing aggregate mode for the authenticated tenant/data boundary; represented as `activeWorkspace = null` only after auth/workspace initialization | PRD FR-C0 and roadmap P1-AC12 |
| Tenant | Authentication/data compatibility boundary that remains independent from Product Line scope; `activeTenant` is not the switcher state | PRD FR-A1a/FR-C0 and roadmap P1-AC7 |
| Product Line | Authorized non-Facility workspace operating scope selected through `setActiveProductLine(productLine \| null, options)` | PRD FR-C2 and roadmap P1-AC3 |
| SC-3 / P1-AC3-P1-AC4 | Switcher fidelity requires one synthetic Facility option, selected Product Line filtering, allowed global agents, and Facility/global aggregate surfaces | PRD SC-3 and roadmap Phase 1 acceptance criteria |
| SC-14 / P1-AC9-P1-AC10 | REST, URL, and SSE use explicit authorized Facility/Product Line scope, reject conflicting or unsafe scope, and preserve omitted scope only as flag-OFF legacy behavior | PRD SC-14 and roadmap P1-AC9/P1-AC10 |
| SC-15 / V2-001 / P1-AC16 | SPEC-002 does not implement tenant-routed gateway selection and must not add direct process-global gateway assumptions outside an approved resolver/adapter with a V2-001 reference | PRD SC-15 and roadmap V2-001 |
| SC-16 / P1-AC14-P1-AC15 | Scope transitions use `scopeKey`, clear incompatible selected state and URL entity params, and ignore stale request or mutation completions | PRD SC-16 and roadmap P1-AC14/P1-AC15 |
| Deferred boundaries | Aegis refactor, task pipelines, `ready_for_owner`, area-label sync, artifacts, governance, pilot behavior, Product Line skill ownership, session/transcript mapping, tenant-routed gateway selection, and multi-facility tenant modeling remain out of SPEC-002 scope | PRD Out of Scope and roadmap SPEC-003 through SPEC-010 boundaries |

## Assumptions

- Users may have Facility-only access, Product Line access, or both.
- Existing single-workspace deployments continue to operate with the feature disabled and do not need any data migration to preserve their current flow.
- The Facility aggregate is always considered part of the authenticated tenant boundary rather than a separate tenant.
- Unsupported surfaces continue to use their existing behavior until later phases define Product Line-aware handling for them.
- SPEC-002 does not introduce multi-facility tenant modeling; tenant remains the current Facility authentication and data boundary.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When the feature is disabled, 100% of baseline user journeys covered by current snapshots remain unchanged.
- **SC-002**: Authorized users can switch between Facility and Product Line views in a single step without losing tenant context.
- **SC-003**: Cross-tab selection changes converge on the same scope for the same tenant and user within 1 second when BroadcastChannel is available; when BroadcastChannel is unavailable, the initiating tab keeps the accepted scope, other tabs remain non-crashing and converge on reload or the next supported initialization path.
- **SC-004**: Unauthorized, conflicting, omitted-while-flag-on, or real `facility` row as Product Line scope requests are rejected every time across REST, URL scope parsing, and SSE setup.
- **SC-005**: Users with Facility access can always reach the aggregate view when their account is authorized for it.
- **SC-006**: No scoped data renders from stale, malformed, wrong-version, wrong-tenant, unauthorized, or real `facility` row persisted Product Line state before `/api/workspaces` validates or clears the stored scope.
- **SC-007**: Agent mutations in Product Line views target the selected id correctly even when a global agent and local agent share the same display name.
- **SC-008**: Every route in the Product Line scope matrix is covered by tests or traceability evidence proving explicit-scope authorization or resource-id authorization back to tenant/workspace.
- **SC-009**: `/api/events` tests cover selected Product Line filtering, Facility aggregate mode, missing or mismatched `workspace_id` payloads, EventSource reconnect on scope change, and whitelisted global events.
- **SC-010**: Playwright flag-OFF coverage proves existing snapshots remain unchanged with no new switcher behavior visible.
- **SC-011**: Playwright flag-ON coverage proves the switcher states render with correct accessibility semantics, including selectable `option` rows, selected state with `aria-selected`, roving focus or `aria-activedescendant`, Arrow/Home/End navigation, Enter/Space selection, Escape/outside-click close, trigger focus return, and non-focusable loading, empty, workspace-list failure, unauthorized-selection, and error rows.
- **SC-012**: Playwright flag-ON coverage proves the header switcher remains visible and does not hide search, notifications, language, theme, or account controls at 320 px, 375 px, and 390 px mobile widths.
- **SC-013**: Playwright flag-ON coverage proves duplicate Facility prevention and same-user same-tenant cross-tab scope convergence.
- **SC-014**: Store and request/cache tests prove `scopeKey` changes reject stale in-flight responses and optimistic mutation completions rather than applying them to the new Facility/Product Line view.
- **SC-015**: Playwright or component evidence proves Facility and Product Line selected states are visually distinct without explanatory header/chrome copy, and traceability evidence maps each mode-sensitive panel and Facility/global surface to the Panel Taxonomy.
- **SC-016**: Flag-OFF verification preserves the pre-SPEC-002 baseline counts recorded in the workflow evidence, with no baseline Vitest or Playwright tests deleted or skipped and no Playwright snapshot files updated.
- **SC-017**: Flag-ON Facility verification keeps existing baseline assertions unchanged while new tests are clearly scoped to SPEC-002 Facility aggregate behavior and do not assert SPEC-003+ downstream behavior.
