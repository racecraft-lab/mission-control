# Data Model: SPEC-002 Product-Line Switcher and activeWorkspace Scoping

## Entities

### Tenant

- Fields: `id`, auth/session identity, Facility boundary metadata
- Relationships: Owns authorized Facility aggregate and accessible Product Line workspaces
- Validation rules: Must remain stable when Product Line scope changes

### Facility Scope

- Fields: `kind = "facility"`, compatibility storage `activeWorkspace = null`, `tenantId`
- Relationships: Represents the aggregate user-facing scope for an authenticated tenant
- Validation rules: Can only be adopted after auth/workspace initialization; must not be confused with the real `workspaces.slug='facility'` row

### Product Line Workspace

- Fields: `id`, `slug`, `name`, `tenantId`, optional `feature_flags`
- Relationships: Belongs to a tenant and can be selected as the scoped Product Line view
- Validation rules: Must be authorized before selection; the real `facility` row is rejected as a Product Line workspace id

### Active Product Line Scope

- Fields: `kind`, `tenantId`, `productLineId?`, `version`, `originTabId`, `userId/sessionId`, `scopeKey`
- Relationships: Drives UI selection, REST/SSE scope, request caching, and cross-tab sync
- Validation rules: Discriminated as Facility or Product Line; state changes must reset incompatible cached UI state; incoming cross-tab messages must match tenant and user/session context and have a newer version than the active scope

### Persisted Product Line Scope

- Fields: storage key `mc:active-workspace:v1`, payload version, `tenantId`, `productLineId | null`, accepted scope version
- Relationships: Hydrates only the Product Line scope slice before Facility/Product Line selection is accepted
- Validation rules: Must reject malformed payloads, unsupported payload versions, wrong-tenant values, unauthorized Product Line ids, and the real `facility` row before scoped data renders; must not persist `activeTenant`, selected entities, filters, modals, drafts, tasks, agents, projects, or conversations

### Scope Key

- Fields: `tenantId`, `scopeKind`, derived `scopeKey`
- Relationships: Used to isolate caches, URL state, and scoped mutations
- Validation rules: Must change when tenant or selected scope changes; stale in-flight responses and optimistic mutation completions must be ignored if their captured key no longer matches the active `scopeKey`

### Workspace Flags

- Fields: `workspaces.feature_flags`
- Relationships: Controls feature availability for workspace-scoped runtime behavior
- Validation rules: `NULL` means all runtime flags OFF; JSON overrides are per-workspace; env `0` forces OFF

## State Transitions

1. Initialize auth/workspace context.
2. Resolve `FEATURE_WORKSPACE_SWITCHER` from the authenticated workspace context.
3. Restore persisted Product Line scope if present.
4. Validate the persisted scope against `/api/workspaces`.
5. Adopt either Facility or an authorized Product Line workspace.
6. Clear incompatible scoped state when scope changes.
7. Broadcast the accepted scope change to other tabs.
8. On `activeTenant` change, clear Product Line scope, ignore persisted values from the previous tenant, and re-enter validation before rendering Product Line data.

## Validation Rules

- Facility selection is synthetic UI state, not the real `facility` row.
- Cross-tenant or unauthorized scope messages are ignored.
- Stale BroadcastChannel messages are ignored when their version is not newer than the active scope.
- BroadcastChannel unavailable fallback must be non-crashing and must not assume other tabs received the new scope.
- Legacy unscoped behavior remains available only when the switcher flag is OFF.
- URL scope parameters must be stripped if they cannot prove ownership.
