# SPEC-002 Retrospective: Product Line Switcher

**Date**: 2026-04-26
**Branch**: `002-product-line-switcher`
**Draft PR**: https://github.com/racecraft-lab/mission-control/pull/16

## Completion Summary

- Generated task completion: 50/50 tasks complete.
- Acceptance coverage: P1-AC1 through P1-AC16 documented as passing in `docs/ai/specs/SPEC-002-workflow.md`.
- Implementation status: Product Line scope switching is implemented behind tenant/facility feature flags, with the Facility aggregate view preserved as the default path.
- PR status: draft PR opened for review; initial review-thread check found no comments or unresolved review threads.

## Verification Evidence

- `pnpm typecheck` passed.
- `pnpm lint` passed with 0 errors / 11 warnings.
- `pnpm test` passed 106 files / 1037 tests.
- `pnpm build` passed.
- `pnpm test:e2e` passed 526 tests.
- `git diff --check` passed.
- Focused Product Line API/SSE suite passed: `pnpm exec playwright test tests/product-line-scope-api.spec.ts tests/product-line-scope-matrix.spec.ts tests/product-line-events.spec.ts`.
- Guardrail greps found no inline runtime `FEATURE_*` reads outside `src/lib/feature-flags.ts` and no new runtime gateway/deferred-boundary coupling.

## Review Remediation

- Facility/global agents now remain visible inside Product Line views through `agentWorkspaceScopePredicate`, while Product Line-local agents stay scoped to the selected Product Line.
- `WorkspaceSwitcher` now distinguishes workspace-load failure from true empty Product Line state.
- Route scope resolution now honors JSON body scope carriers and rejects conflicting query/body carriers through `resolveWorkspaceScopeFromRequest`.
- Initial GitHub PR review check found no comments and no review threads.

## What Worked

- Keeping Product Line switching hard-default OFF preserved existing Facility aggregate behavior while allowing focused flag-on coverage.
- Centralizing scope parsing and authorization in `src/lib/workspaces.ts` reduced drift across REST routes, SSE, panels, store transitions, and URL/cache handling.
- The generated acceptance ledger made it clear when implementation was complete versus when post-review remediations changed the final test counts.

## Issues Encountered

- The earlier recovery state overclaimed completion before the post-implementation PR workflow finished. The final post list now records Verify Implementation, Integration Suite, Code Review, Cleanup, PR Creation, Review Remediation, and Retrospective explicitly.
- Newly added generated markdown files had trailing whitespace that was only caught after staging because untracked files are not covered by plain `git diff --check`.
- Agent visibility needed a stricter distinction between Product Line data scoping and Facility/global operational visibility.

## Follow-Up

- Keep the roadmap PR-merge caveat until PR #16 is reviewed and merged.
- Re-check GitHub checks and review threads before marking the PR ready for merge.
- Do not expand SPEC-002 into multi-facility tenants, product-line skill ownership, session/transcript ownership, or tenant-routed gateway selection; those remain deferred to the documented V2 roadmap boundaries.
