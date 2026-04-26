# Contract: Product Line Scope and Workspace Switcher

## Scope Resolution Contract

- `resolveFlag(name, ctx)` is the only runtime entrypoint for feature-flag evaluation.
- `FEATURE_WORKSPACE_SWITCHER` defaults OFF.
- Workspace JSON overrides are honored from `workspaces.feature_flags`.
- `FEATURE_* = 0` forces OFF.
- `FEATURE_* = 1` does not force ON except the single roadmap-approved pilot exception.

## UI Contract

- The switcher renders one synthetic Facility option and authorized Product Line options.
- The UI never exposes the real `facility` row as the aggregate option.
- Facility and selected Product Line trigger/option states are visually distinct through selected value, selected-row treatment, and existing muted/border/background states without explanatory header/chrome copy.
- Selectable rows use listbox `option` semantics with selected state and `aria-selected`; keyboard focus uses roving focus or `aria-activedescendant`; Arrow Up/Down, Home/End, Enter/Space, Escape close, outside-click close, and trigger focus return are required interactions.
- Loading and empty states are non-focusable `role="status"` content; workspace-list failure, unauthorized-selection, and error states are non-focusable `role="alert"` content outside the selectable option set.
- Header terminology uses Facility/Product Line, not Workspace.

## Panel Taxonomy Contract

- Mode-sensitive panel UX: task board, agent squad, project manager modal, quality-review surfaces, and DB-backed chat message/conversation surfaces.
- Facility/global panel UX: live feed, notifications, dashboard/status, system monitor, audit trail, skills, and local/gateway sessions/transcripts remain aggregate for SPEC-002.
- Cross-cutting backing routes listed in the route matrix still authorize the accepted Facility/Product Line scope so aggregate panels and shared header search cannot leak unauthorized Product Line data.

## Scope State Contract

- `setActiveProductLine(productLine | null, options)` is the required transition API.
- Runtime scope is discriminated as Facility or Product Line; Facility is represented as compatibility state with `activeWorkspace = null` only after auth/workspace initialization.
- Zustand persistence uses localStorage key `mc:active-workspace:v1` for the Product Line scope slice only.
- Hydration rejects malformed payloads, unsupported payload versions, wrong-tenant values, unauthorized Product Line ids, and the real `facility` row before scoped data renders.
- `activeTenant` remains independent from Product Line scope; tenant changes clear Product Line scope and require new `/api/workspaces` validation before scoped Product Line data renders.
- Accepted BroadcastChannel messages must match tenant and user/session guards and have a newer version than the active scope; stale versions are ignored.
- If BroadcastChannel is unavailable, the app does not crash or widen scope; other tabs converge only on reload or the next supported initialization path.
- Scope changes clear incompatible project, agent, project, conversation, modal, filter, and draft state unless keyed by the current `scopeKey`.
- Request/cache/URL ownership uses `scopeKey`; stale in-flight responses and optimistic mutation completions are ignored when their captured `scopeKey` no longer matches the active scope.

## REST and SSE Contract

- Product Line requests use `workspace_id=<id>`.
- Facility requests use `workspace_scope=facility`.
- Both parameters together return `400`.
- Unauthorized ids return `403`.
- The real `facility` row used as Product Line scope returns `400`.
- `/api/events` must reject mismatched or missing scoped events for selected Product Line clients and reconnect when scope changes.

### In-Scope API Route Matrix

SPEC-002 scope applies to these live route handlers and any task generated from this contract must preserve this exact matrix unless a later checklist updates it with current route-discovery evidence:

- Task routes: `/api/tasks`, `/api/tasks/[id]`, `/api/tasks/[id]/comments`, `/api/tasks/[id]/broadcast`, `/api/tasks/[id]/branch`, `/api/tasks/queue`, `/api/tasks/outcomes`, and `/api/tasks/regression`.
- Project routes: `/api/projects`, `/api/projects/[id]`, `/api/projects/[id]/agents`, and `/api/projects/[id]/tasks`.
- Agent routes: `/api/agents`, `/api/agents/[id]`, `/api/agents/[id]/attribution`, `/api/agents/[id]/diagnostics`, `/api/agents/[id]/files`, `/api/agents/[id]/heartbeat`, `/api/agents/[id]/hide`, `/api/agents/[id]/keys`, `/api/agents/[id]/memory`, `/api/agents/[id]/soul`, `/api/agents/[id]/wake`, `/api/agents/comms`, `/api/agents/evals`, `/api/agents/message`, `/api/agents/optimize`, `/api/agents/register`, and `/api/agents/sync`.
- Product Line-aware support routes: `/api/quality-review`, `/api/chat/messages`, `/api/chat/messages/[id]`, `/api/chat/conversations`, `/api/search`, `/api/activities`, `/api/notifications`, `/api/notifications/deliver`, `/api/status` for status/dashboard backing behavior, `/api/audit`, `/api/system-monitor`, and `/api/events` for live-feed/SSE backing behavior.

### Scope Request and Error Shape

- The same scope contract applies to query-string, request-body, URL-adoption, and SSE setup inputs.
- `workspace_id` identifies an authorized non-Facility Product Line workspace.
- `workspace_scope=facility` identifies the authenticated Facility aggregate.
- A request containing both `workspace_id` and `workspace_scope=facility` returns `400` with `{ error }`.
- A request containing a real `workspaces.slug='facility'` row as `workspace_id` returns `400` with `{ error }`.
- A request containing malformed scope syntax, an unsupported `workspace_scope` value, or duplicate/conflicting scope values across query-string, request-body, URL-adoption, or SSE setup carriers returns `400` with `{ error }`.
- A request containing a nonexistent, cross-tenant, or otherwise unauthorized well-formed `workspace_id` returns the repo's normal `403` shape with `{ error }`.
- When `FEATURE_WORKSPACE_SWITCHER` is ON, omitted scope is not a Product Line contract: list, detail, mutation, search, URL, and SSE setup paths must either reject omission with `{ error }` or prove ownership by resource id without widening to `auth.user.workspace_id`.
- When `FEATURE_WORKSPACE_SWITCHER` is OFF, omitted scope preserves the legacy single-workspace behavior and may use `auth.user.workspace_id`/workspace `1` fallbacks.

### Authorization and Query Ownership

- Collection and list routes must resolve and authorize Facility/Product Line scope before composing SQL predicates or invoking helper queries.
- Detail and mutation routes must authorize by the explicit accepted scope, or by joining the requested resource id back to the caller's tenant/workspace boundary before reading or mutating the resource.
- Existing `auth.user.workspace_id` defaults are legacy fallback inputs only; they must not override an explicit Product Line `workspace_id` or Facility `workspace_scope=facility` when the feature flag is ON.
- Task queue, outcome, and regression routes are scoped read/mutation surfaces and must use the accepted Facility/Product Line scope for task selection, aggregation, and update queries.
- Header search uses `/api/search`, so search results must be scoped to the accepted Facility/Product Line context and must not leak tasks, agents, activities, messages, notifications, webhooks, pipelines, or audit rows from another unauthorized workspace.

### SSE Event Contract

- `/api/events` authorizes the requested Facility/Product Line scope before registering an event listener or sending any scoped event.
- Facility streams aggregate only events authorized for the authenticated tenant/facility boundary.
- Product Line streams send only events for the accepted `workspace_id`.
- Workspace-scoped event payloads must include `workspace_id`; selected Product Line clients must drop missing or mismatched payloads as defense in depth.
- Allowed global event types that may omit `workspace_id` are limited to connection/system lifecycle events: `connected`, `connection.created`, and `connection.disconnected`. Heartbeat comments are transport keep-alives, not data events.
- EventSource clients close the current `/api/events` stream and create a new stream whenever Facility/Product Line scope changes.

### API Acceptance Traceability

- P1-AC4: The route matrix and query-ownership rules define which Product Line views are scoped and which Facility/global surfaces remain aggregate.
- P1-AC9: The scope request and error-shape rules define `workspace_id`, `workspace_scope=facility`, both-params `400`, unauthorized `403`, facility-row `400`, and flag-OFF legacy omission.
- P1-AC10: The SSE contract defines authorized Product Line filtering, Facility aggregation, required `workspace_id` payloads, EventSource reconnect, and global-event allowlisting.
- P1-AC14: Query ownership and `scopeKey` state rules prevent stale request or mutation completions from applying to the wrong scope.
- P1-AC15: URL-adoption inputs follow the same scope request and authorization contract as REST and SSE setup.
