# Quickstart: SPEC-002 Product-Line Switcher and activeWorkspace Scoping

## Prerequisites

- Node.js 22+
- pnpm
- A checked-out `002-product-line-switcher` worktree

## Verify the Plan Artifacts

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

If the environment supports it, also run:

```bash
pnpm test:e2e
```

## Feature-Flag Baseline Check

1. Run the app with `FEATURE_WORKSPACE_SWITCHER=0`.
2. Run `FEATURE_WORKSPACE_SWITCHER=0 pnpm test:all`.
3. Confirm the existing single-workspace behavior remains unchanged.
4. Confirm the pre-SPEC-002 baseline counts recorded in the workflow evidence are not reduced or skipped: 996 Vitest tests and 514 Playwright tests. The current implementation pass increased the verified counts to 1037 Vitest tests and 526 Playwright tests.
5. Confirm no Playwright snapshot files are updated and no snapshot update command is required.
6. Confirm no new switcher behavior appears in the header.

## Flag-On Scope Check

1. Seed `workspaces.feature_flags` for the authenticated workspace context.
2. Confirm the switcher renders exactly one synthetic Facility option.
3. Select Facility and a Product Line workspace.
4. Confirm REST, SSE, URL scope, and cross-tab state follow the selected scope.
5. With Facility selected, keep existing baseline assertions unchanged and add only SPEC-002 tests for Facility aggregate semantics.

## UX and Accessibility Check

1. Confirm Facility and selected Product Line states are visually distinct without adding explanatory header or chrome copy.
2. Confirm 320 px, 375 px, and 390 px header checks preserve the compact trigger, search, notifications, language, theme, and account controls with long Product Line names truncated.
3. Confirm listbox semantics cover selected state, `aria-selected`, roving focus or `aria-activedescendant`, Arrow/Home/End navigation, Enter/Space selection, Escape/outside-click close, and trigger focus return.
4. Confirm loading and empty states are non-focusable `role="status"` content, while workspace-list failure, unauthorized-selection, and error states are non-focusable `role="alert"` content outside the selectable option set.
5. Confirm mode-sensitive panels and Facility/global surfaces match the Panel Taxonomy in `spec.md`.

## State-Management Check

1. Confirm only the Product Line scope slice is persisted under `mc:active-workspace:v1`.
2. Confirm malformed, wrong-version, wrong-tenant, unauthorized, and real `facility` row persisted Product Line values are cleared after `/api/workspaces` validation before scoped data renders.
3. Confirm `activeTenant` changes clear Product Line scope and do not reuse a previous tenant's persisted Product Line value.
4. Confirm BroadcastChannel messages include tenant and user/session guards, reject stale versions, and converge within 1 second when available.
5. Confirm BroadcastChannel unavailable fallback is non-crashing and relies on reload or the next supported initialization path for other-tab convergence.
6. Confirm stale in-flight responses and optimistic mutation completions are ignored when their captured `scopeKey` no longer matches the active scope.

## Static Guardrail Checks

Feature flag reads must stay behind `resolveFlag()`:

```bash
if rg -n 'process\.env\.FEATURE_[A-Z0-9_]+' src --glob '!src/lib/feature-flags.ts'; then
  echo "Inline FEATURE_* env read found outside resolveFlag()" >&2
  exit 1
fi
```

When gateway-facing code is touched, run the grep against the touched gateway-facing files and treat matches as failures unless each match is in a documented resolver/adapter path with an SC-15/V2-001 reference:

```bash
rg -n 'OPENCLAW_GATEWAY_|config\.gatewayHost|config\.gatewayPort|gateways\.is_primary' <touched-gateway-facing-files>
```

Header tenant/facility context must not be visibly labeled "Workspace":

```bash
rg -n 'Workspace' src/components/layout/header-bar.tsx messages/en.json
```

The only allowed header match is the internal `WorkspaceSwitcher` component symbol. Other `messages/en.json` workspace strings belong to unrelated admin, boot, docs, or provisioning surfaces and are not tenant-context header copy.

## SPEC-002-Only Test Boundary

- New tests cover feature-flag resolution, Facility/Product Line scope, switcher behavior, REST/SSE scoping, cache/URL ownership, state invalidation, and BroadcastChannel behavior.
- New tests must not assert downstream Aegis ownership, task pipeline behavior, `ready_for_owner`, area labels, artifacts, governance, Product Line skill ownership, session/transcript mapping, tenant-routed gateway selection, or multi-facility tenant modeling.

## Notes

- Facility means aggregate tenant scope, not the real `facility` workspace row.
- Use `setActiveProductLine(productLine | null, options)` for all scope transitions in implementation work.

## Implementation Verification Evidence

Recorded on 2026-04-26 from worktree `.worktrees/002-product-line-switcher` on branch `002-product-line-switcher`:

- `pnpm typecheck` passed.
- `pnpm build` passed and generated the standalone App Router bundle used by E2E.
- `pnpm test` passed: 106 files, 1037 tests.
- `pnpm lint` passed with 0 errors and 11 pre-existing warnings.
- `pnpm exec playwright test tests/product-line-scope-api.spec.ts` passed: 2 tests.
- `pnpm exec playwright test tests/injection-guard-endpoints.spec.ts tests/limit-caps.spec.ts` passed after remediation: 15 tests.
- `pnpm test:e2e` passed after remediation: 526 tests.
- `rg -n 'process\.env\.FEATURE_[A-Z0-9_]+' src --glob '!src/lib/feature-flags.ts'` returned no matches.

Traceability notes:

- SC-003 and P1-AC6 map to `src/store/index.ts` guarded `BroadcastChannel` handling, persisted `scopeVersion`, and scope-change invalidation; expanded standalone cross-tab UI coverage remains listed in `tasks.md`.
- SC-014 and P1-AC14 map to `scopeKey` helpers in `src/types/product-line.ts`, the store scope slice, and scoped URL/request calls through `appendScopeToPath`.
- SC-15/V2-001 and P1-AC16 remain deferred: SPEC-002 does not add tenant-routed gateway selection or multi-facility runtime modeling.
- SC-016 and P1-AC14/P1-AC15 map to `setActiveProductLine(productLine | null, options)`, persisted-scope validation after `/api/workspaces`, and panel/API request scoping.
- P1-AC12 through P1-AC16 are documented in `spec.md`, `plan.md`, this quickstart, and the workflow ledger; generated standalone browser/component coverage tasks that were not separately implemented remain unchecked in `tasks.md`.
