# Implementation Plan: SPEC-002 Product-Line Switcher and activeWorkspace Scoping

**Branch**: `002-product-line-switcher` | **Date**: 2026-04-26 | **Spec**: [`spec.md`](./spec.md)
**Input**: Feature specification from `/specs/002-product-line-switcher/spec.md`

## Summary

Add a feature-flagged Product Line switcher that keeps tenant/facility context independent from Product Line scope, persists selection safely, scopes REST/SSE/cache/URL ownership by `scopeKey`, and preserves flag-off behavior and existing snapshots.

## Technical Context

**Language/Version**: TypeScript 5 on Next.js 16 App Router with React 19
**Primary Dependencies**: Zustand, better-sqlite3, Tailwind CSS 3, Vitest, Playwright
**Storage**: SQLite plus Zustand `persist` localStorage key `mc:active-workspace:v1` for the Product Line scope slice only
**Testing**: Vitest, Playwright e2e, Docker-backed Playwright for the real Product Line UI journey, `pnpm typecheck`, `pnpm lint`; flag-OFF regression evidence must preserve the pre-SPEC-002 baseline test counts and Playwright snapshots, while flag-ON Facility coverage adds SPEC-002-only aggregate-scope assertions without rewriting existing baseline tests
**Target Platform**: Web application
**Project Type**: Web application
**Performance Goals**: Preserve existing baseline behavior with flag OFF; cross-tab sync should converge within 1s when BroadcastChannel is available
**Constraints**: Hard default OFF feature flag resolution; no direct `process.env.FEATURE_*` runtime checks outside `resolveFlag`; preserve SC-15/V2-001 gateway assumptions; new production modules are limited to the feature-flag helper, Product Line types, and switcher UI module, while existing store, header, panel, API, SSE, URL, and test files may be edited only for documented SPEC-002 scope behavior
**Scale/Scope**: Single Mission Control web app with scoped REST/SSE routes, header UI, store transitions, and regression tests
**Strict Scope**: New production modules are limited to `src/components/layout/workspace-switcher.tsx`, `src/types/product-line.ts`, and `src/lib/feature-flags.ts`; required edits to existing production files must stay limited to `setActiveProductLine(productLine | null, options)`, Product Line scope persistence/hydration, `scopeKey` request/cache/URL ownership, scoped state invalidation, guarded BroadcastChannel sync, and explicit REST/SSE scoping for the route matrix.

**UX Scope Taxonomy**: Mode-sensitive panels are task board, agent squad, project manager modal, quality-review surfaces, and DB-backed chat message/conversation surfaces. Facility/global panel UX remains aggregate for live feed, notifications, dashboard/status, system monitor, audit trail, skills, and local/gateway sessions/transcripts, while cross-cutting backing routes still enforce the accepted Facility/Product Line authorization contract to prevent leaks.
**Switcher UX Requirements**: The header/switcher implementation must keep Facility and selected Product Line states visually distinct without explanatory header/chrome copy, preserve `min-w-0` bounded/truncated layout at 320/375/390 px, implement selected-state listbox semantics with `aria-selected`, roving focus or `aria-activedescendant`, Arrow/Home/End, Enter/Space, Escape/outside-click close, trigger focus return, and keep loading/empty/workspace-list failure/unauthorized/error content outside the selectable option set as non-focusable status/alert content.

## Constitution Check

GATE: Must pass before Phase 0 research and re-check after Phase 1 design.

- Zero-regression contract: Planned changes are additive and flag-gated; flag-off behavior must remain byte-compatible, preserve the pre-SPEC-002 Vitest/Playwright baseline counts recorded in the workflow evidence, and require no Playwright snapshot updates.
- Feature-flag resolution discipline: All new runtime behavior must route through `resolveFlag(name, ctx)` in `src/lib/feature-flags.ts`.
- Upstream compatibility discipline: No destructive schema change or upstream-owned merge risk is introduced by the plan.
- Test-first development: Plan assumes failing tests are written before runtime implementation.
- Real UI journey quality gate: Product Line switcher acceptance requires real Playwright coverage against the running app, deterministic seed data, screenshot artifacts for reviewer inspection, and remediation of failing or visibly defective UI journeys before PR update.
- Strict scope ramp: New production modules are limited to the three spec-owned files listed above.
- Package manager: pnpm is required for verification.

## Project Structure

### Documentation (this feature)

```text
specs/002-product-line-switcher/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── app/
├── components/
│   └── layout/
├── lib/
└── types/
tests/
```

**Structure Decision**: This is a web application feature with planning artifacts under `specs/002-product-line-switcher/` and runtime touch points limited to `src/components/layout/`, `src/lib/`, and `src/types/` for the strict-scope modules plus documented Phase 1 support files.

## Complexity Tracking

No constitution violations require justification at the planning stage.

## Regression Safety Gates

- Flag OFF: `FEATURE_WORKSPACE_SWITCHER=0 pnpm test:all` must preserve existing single-workspace behavior, must not reduce or skip the pre-SPEC-002 baseline counts recorded in the workflow evidence, and must produce no Playwright snapshot diffs or snapshot update artifacts.
- Flag ON Facility: seed `workspaces.feature_flags` for the authenticated Facility/workspace context; existing baseline assertions must remain unchanged, and new tests must assert only SPEC-002 Facility aggregate semantics.
- Test scope: new Vitest and Playwright tests must cover only SPEC-002 feature-flag resolution, Facility/Product Line scope, REST/SSE contract, cache/URL ownership, switcher UX, state transitions, and BroadcastChannel behavior. They must not encode Aegis ownership, task pipeline, `ready_for_owner`, area-label, artifact, governance, Product Line skill ownership, session/transcript mapping, tenant-routed gateway selection, or multi-facility tenant assumptions from later specs.
- Real UI journey gate: `tests/product-line-switcher-ui.spec.ts` must drive the running app with seeded Product Line data, attach screenshots for the core Facility/Product Line states and narrow mobile layouts, and pass through `pnpm test:e2e:docker` before the PR branch is updated.
- Feature-flag grep: runtime code must not introduce inline `process.env.FEATURE_*` reads outside `src/lib/feature-flags.ts`; implementation verification must run the quickstart grep and fail on any unapproved match.
- Gateway grep: when gateway-facing code is touched, implementation verification must grep touched files for new direct `OPENCLAW_GATEWAY_*`, `config.gatewayHost`, `config.gatewayPort`, or `gateways.is_primary` assumptions and allow matches only in an explicitly documented resolver/adapter path with an SC-15/V2-001 reference.
