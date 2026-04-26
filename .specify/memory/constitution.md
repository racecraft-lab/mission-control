# Mission Control Constitution

Governing principles for the `racecraft-lab/mission-control` fork of
`builderz-labs/mission-control`. This document is the source of truth for
architectural discipline, upstream-compatibility commitments, and the
autopilot conventions that SpecKit consensus agents rely on when
resolving questions during clarify, checklist, and analyze phases.

Companion documents:

- Product requirements: `docs/rc-factory-v1-prd.md`
- Technical roadmap and spec index: `docs/ai/rc-factory-technical-roadmap.md`
- Rollback runbook: `docs/migrations/rollback-procedure.md` (authored in SPEC-001)
- Pilot smoke checklist: `docs/qa/pilot-smoke-checklist.md` (authored in SPEC-009)

## Core Principles

### I. Zero-Regression Contract (NON-NEGOTIABLE)

Every existing single-workspace deployment must run unchanged after
applying any new migration or feature. This is the primary acceptance
criterion for every spec.

Operationalized as:

- `workspace_id = 1` fallback is preserved across all scoped queries.
- All new runtime behavior is additive, feature-flag-guarded, or
  null-default.
- `pnpm test:all` (lint + typecheck + vitest + build + playwright) shows
  zero new failures and zero snapshot diffs against the pre-change
  baseline when new feature flags are OFF.
- "Byte-compatible" means: with flag OFF and with `activeWorkspace = null`,
  the authenticated single-workspace UX produces identical API payloads
  and identical Playwright snapshots.

### II. Upstream Compatibility Discipline (NON-NEGOTIABLE)

Cherry-picks from `builderz-labs/mission-control` `main` must remain
viable. Every feature is classified before implementation as:

| Class | Meaning |
|---|---|
| `upstream-safe` | Additive, opt-in, plausible upstream candidate. |
| `upstream-divergent` | Runtime-safe for current installs, but adds schema/state/API divergence that grows fork pressure. |
| `fork-only optional` | OpenClaw/local-environment-specific adapter that must be absent-safe and disabled by default. |

Hard prohibitions:

- No SQL RENAME of `workspaces`, `workspace_id` columns, `agents.workspace_path`,
  `quality_reviews.reviewer`, `project_agent_assignments.agent_name`, or
  any other upstream-owned identifier.
- No destructive migration.
- No edits to upstream-owned files (`src/app/layout.tsx`, `src/lib/auth.ts`,
  etc.) that would create merge conflicts — isolate additions to new files
  or extend via hooks.

### III. OpenClaw Adapter Isolation

Features that read OpenClaw artifacts are fork-only adapters. They
must:

- Be disabled by default and guarded by a dedicated feature flag
  (e.g., `FEATURE_OPENCLAW_HEALTH_COSTS`).
- No-op cleanly when `~/.openclaw/health/` is absent or malformed (no
  scheduler crash, no API breakage, no UI regression, no false governance
  blocks).
- Require no schema migration in v1. OpenClaw telemetry is runtime-only
  in this major version.

### IV. Test-First Development (NON-NEGOTIABLE)

All production code changes follow red-green-refactor:

1. Write the failing test first (Vitest unit, Playwright e2e, or
   contract test as appropriate).
2. Run it; confirm it fails for the expected reason.
3. Write the minimum implementation to pass.
4. Refactor for clarity with tests still green.

Exceptions: documentation-only edits, dependency pin bumps that touch
no runtime code, and pure file-move refactors with tests unchanged.

Every PR must pass `pnpm typecheck` and `pnpm lint` clean.

### V. Feature-Flag Resolution Discipline

All new runtime behavior routes through the single helper
`resolveFlag(name, ctx)` exported from `src/lib/feature-flags.ts`.

- **Hard-default OFF.** Every flag baseline is `false`.
- **Per-workspace JSON override.** `workspaces.feature_flags JSON` may
  set `{ "FEATURE_X": true }` for a specific workspace.
- **Env kill-switch.** `process.env.FEATURE_X === '0'` forces OFF
  regardless of JSON state. `process.env.FEATURE_X === '1'` does NOT
  force ON — only JSON can opt a workspace in.
- **Exception:** `PILOT_PRODUCT_LINE_A_E2E` may be flipped via env (operator-
  temporary pilot switch).
- **Forbidden.** Inline `process.env.FEATURE_*` checks anywhere in
  runtime code. CI greps and fails on match.

### VI. Dependency Supply-Chain Hygiene

Every new runtime dependency must be:

- An explicit entry in `package.json` with a pinned version.
- Present in `pnpm-lock.yaml`.
- Imported directly — never via a transitive dependency.
- Reviewed as a supply-chain surface.

Named dependencies with this status: `ajv`, `jsonpath-plus`, `safe-regex`.
Any future addition (schema validator, expression evaluator, crypto lib,
etc.) receives the same treatment.

`pnpm audit` clean before merge.

### VII. Additive Migration Policy

SQL migrations are append-only and additive:

- No destructive changes.
- No column renames unless the live schema is independently verified AND
  paired with a tested rollback SQL file AND the rename is ratified as
  upstream-divergent in a spec.
- Each migration ships a companion rollback file at
  `docs/migrations/rollback-M<id>.sql` with idempotent reverse SQL.
- Each migration is listed in the operator runbook at
  `docs/migrations/rollback-procedure.md`.
- The runtime migration runner (`src/lib/migrations.ts`) is forward-only;
  rollback is documented manual reverse SQL.

Schema truth-check gate (enforced in every spec): if a PR claims a column,
table, or constraint exists, the spec must cite the live
`src/lib/migrations.ts` line or schema.sql evidence. Claims contradicting
the live schema block merge.

### VIII. Successor Side-Effect Parity (Structural Enforcement)

All task creation MUST go through the shared helper `createTask()` in
`src/lib/task-create.ts`. The helper performs:

- `INSERT INTO tasks`.
- Ticket-counter allocation.
- `activities` row.
- Creator subscription.
- Mention/assignee notifications.
- GitHub push when `projects.github_sync_enabled = 1` AND
  `projects.github_repo IS NOT NULL`.
- GNAP push when configured.

Direct `INSERT INTO tasks` outside `src/lib/task-create.ts` is forbidden.
CI greps for `INSERT INTO tasks` outside that file and fails on match.

Parity is enforced structurally — by sharing the function — not by keeping
two parallel code paths synchronized.

### IX. Safe Evaluation Discipline

The routing-rule evaluator and the output-schema validator both operate
over untrusted agent output. Both must be safe-by-construction.

**Routing-rule evaluator** (`src/lib/routing-rule-evaluator.ts`):

- JSONPath traversal uses `jsonpath-plus` with `eval: 'safe'` or
  `preventEval: true`.
- Boolean grammar is parsed by a hand-written recursive-descent parser
  over an explicit operator allowlist: `==`, `!=`, `in`, `not in`,
  `&&`, `||`, `!`.
- Forbidden: `eval` global, `Function` constructor, `vm`, `vm2`, `with`,
  dynamic `require`, prototype-chain access (`__proto__`, `constructor`),
  arithmetic on right-hand side, bitwise operators, regex on right-hand
  side, any operator outside the allowlist.
- CI greps for forbidden primitives and fails on match.

**Output-schema validator** (`src/lib/output-schema-validator.ts`):

- AJV direct pinned dependency.
- Constrained JSON Schema profile with numeric bounds:
  - `maxOutputBytes = 262144` (256 KiB)
  - `maxSchemaBytes = 65536` (64 KiB)
  - `maxNestingDepth = 16`
  - `maxKeysPerObject = 256`
  - `maxArrayLength = 1024`
  - `maxStringLength = 32768`
  - `maxPatternLength = 256`
  - `maxValidationMs = 50`
- Forbidden schema features: remote `$ref` (only `#/...` local refs),
  `$dynamicRef`, `$dynamicAnchor`, custom keywords, async schemas, the
  `format` validator (annotations OK, enforcement forbidden), any
  `pattern` rejected by `safe-regex`.
- Compiled validators cached per `(template_id, schema_sha256)` with
  LRU eviction at 256 entries.

### X. Observability and Auditability

Every state-changing event produces a durable record:

- Every triage-template completion → one row in `task_dispositions`
  (regardless of successor choice; insert failure does not block
  advancement but is logged to `activities`).
- Every state transition → `activities` row.
- Every governance decision that is not `allow` → `resource_policy_events`
  row plus an operator-visible `activities` row.
- Every secret-detector finding → `activities` row of kind
  `security_violation` with the matched rule id (NEVER the matched
  substring).
- Every artifact publish → `task_artifacts` row with provenance:
  producer agent, workflow-template slug, MIME type, byte size,
  SHA-256, preview text, redaction status, and security-scan status.

### XI. Keep It Simple

The simplest correct solution wins. Clever code is a liability;
boring code is an asset. Every spec and PR is judged against this
principle alongside the structural rules above.

Operationalized as:

- Choose the obvious, straightforward solution over the elegant or
  clever one.
- If code requires extensive comments to explain WHAT it does (vs.
  WHY a non-obvious decision was made), it is too complex — refactor
  it or split the function.
- One function does one thing. One module owns one responsibility.
- Avoid nested conditionals deeper than three levels; extract to a
  separate function or early-return.
- Prefer explicit code paths over implicit behavior. No magic globals,
  no monkey-patching, no behavior conditioned on unexported state.

This principle is advisory at PR review time, not CI-enforced. Reviewers
have standing to require simplification of any change that violates it.

### XII. Avoid Speculative Generality

Build only what the current spec or task requires. Premature
abstraction creates maintenance burden without delivering value.

Operationalized as:

- Do NOT add features, parameters, configuration knobs, or capabilities
  beyond what the current spec calls for.
- Do NOT create abstractions for one-time operations. Three duplicated
  lines is better than a premature utility function.
- Do NOT add "just in case" error handling for scenarios that cannot
  occur given current call sites and type guarantees.
- Do NOT design for flexibility that has no current consumer.
- Do NOT introduce feature flags for behavior that has no rollback or
  per-workspace differentiation requirement (Principle V already
  governs the flags that exist; this principle prevents adding flags
  preemptively).

When a spec genuinely needs an extension point in the future, add it
in the spec that consumes it — not in advance.

### XIII. Defensive Boundaries, Trusting Interior

Errors at system boundaries (HTTP, GitHub webhooks, database, agent
output, OpenClaw artifacts, child-process exec) MUST be caught,
classified, and surfaced as structured data. Errors inside the trusted
interior do not need defensive wrapping.

Operationalized as:

- Every external call (fetch, db query helper, exec, file read of an
  untrusted path) is wrapped in error handling that converts the
  failure into a typed result or a structured `activities` row.
- Partial failures in batch operations MUST NOT fail the entire batch.
  Per-item success/failure status is preserved at original indices and
  surfaced in the response payload.
- Error responses MUST include actionable context: the operation type,
  the offending item ids, and the failure reason. Never include the
  raw matched substring of a secret or untrusted user payload — log
  the rule id or content hash instead.
- Validation errors MUST identify the specific field and the
  constraint violated.
- Timeout errors MUST be distinguishable from logic errors in the
  emitted `activities` kind.
- Inside the trusted interior (function-to-function calls within a
  single module, where types and invariants are guaranteed by Principle
  IV's tests), do NOT add defensive checks for impossible states. Trust
  the type system and the surrounding tests.

This principle complements Principle X. Observability and Auditability
records WHAT happened; this principle ensures the recording never
crashes the request and never leaks secrets while doing so.

## Tech Stack Constraints

- Next.js 16, React 19, TypeScript 5.7.
- better-sqlite3 (SQLite) for persistence; forward-only migration runner
  at `src/lib/migrations.ts`.
- Zustand for client state. The `activeWorkspace` slice only uses
  `zustand/middleware`'s `persist` (key `mc:active-workspace:v1`,
  `localStorage`) plus a `BroadcastChannel('mc:active-workspace')`
  listener. Other slices keep current persistence semantics.
- pnpm is the only package manager. No npm/yarn.
- Node ≥22 (LTS recommended).
- xyflow/react, reagraph for graph surfaces.
- Playwright + Vitest for tests.
- Standalone Next.js build (`output: 'standalone'` in `next.config.js`).
- Run command: `node .next/standalone/server.js` for standalone mode
  (NOT `pnpm start`, which requires full `node_modules`).

## Autopilot Conventions

These conventions are consumed by `/speckit-pro:setup`, `/speckit-pro:autopilot`,
and the consensus agents (`codebase-analyst`, `spec-context-analyst`,
`domain-researcher`, `consensus-synthesizer`, `gate-validator`).

### A. Diff base for diff-scoped acceptance criteria

Any acceptance criterion of the form "ripgrep over the diff finds/does not
find X" is evaluated against the diff `origin/main...HEAD` on the spec's
worktree branch. `gate-validator` scripts use this base when resolving
diff-scoped gates.

### B. MANUAL acceptance-criterion marker

Acceptance criteria that require human operator judgment (wall-clock
timing, visual verification of external systems, PR-merge actions) are
marked with the suffix `— MANUAL` in the roadmap (e.g.,
`[P8-AC1 — MANUAL]`, `[P9-AC1 — MANUAL]`).

- `gate-validator` MUST recognize the `— MANUAL` suffix and exclude such
  ACs from automated gate evaluation.
- MANUAL AC evidence lives in `docs/qa/pilot-smoke-checklist.md`.
- The autopilot workflow file records MANUAL ACs as pending until the
  operator checks them off in the smoke checklist.

### C. Migration-only spec profile

A spec whose scope is exclusively schema migrations (e.g., SPEC-001) may
declare `autopilot-profile: migration-only` in its workflow frontmatter.
For such specs:

- `clarify` phase produces zero `[NEEDS CLARIFICATION]` markers;
  any clarify output defaults to "N/A — pure-schema spec".
- `checklist` phase resolves gaps to "N/A — pure-schema spec".
- `analyze` phase findings are limited to migration-safety / idempotency
  categories.
- `implement` phase performs migration writes and per-migration smoke
  checks from the spec's acceptance criteria.

### D. Human-gate convention (G_PILOT_MERGE)

SPEC-009 has one intentional human-in-the-loop checkpoint. Autopilot
stops after observing `ready_for_owner` on the pilot task and resumes
(or marks complete) when `pullFromGitHub` records the linked PR merge.

This is recorded as gate `G_PILOT_MERGE` in the workflow file and is
NOT validated by `gate-validator`. Operator runs the pilot smoke
checklist items and re-triggers autopilot's `implement --resume` once
the PR is merged.

### E. Test-fixture corpus locations

Reserved directories for autopilot-authored test fixtures:

- `src/lib/__tests__/fixtures/secrets/` — positive and negative fixtures
  for every rule in `src/lib/secret-detector.rules.ts` (MC Secret
  Detector v1). CI fails if any rule lacks at least one positive AND
  one negative fixture.
- `src/lib/__tests__/fixtures/routing/` — adversarial fixtures for the
  routing-rule evaluator (prototype pollution, oversized literals,
  malformed JSONPath, etc.).
- `src/lib/__tests__/fixtures/schema-corpus/` — fixed-seed valid-output
  corpus for schema-validator p95 measurement.

Fixture directories are created by the first spec that needs them and
remain under version control.

### F. Webhook fixture seam

`pullFromGitHub` accepts an optional `{ webhookFixture }` parameter used
by tests to inject closed-PR / merged events. The production call path
must pass no fixture; the seam is inert in production. Adding this seam
is a SPEC-005 or SPEC-009 deliverable.

### G. Rollback file presence gate

For every migration added in a diff, a corresponding
`docs/migrations/rollback-M<id>.sql` file must exist in the same diff.
CI (or `validate-gate.sh` when running under autopilot) enforces this by
greping the diff for `ALTER TABLE`, `CREATE TABLE`, and
`INSERT OR IGNORE INTO workspaces` statements and requiring a matching
rollback file.

### H. Tool-surface declaration

Specs in this project are non-tool-surface (not MCP tool definitions).
`/speckit-pro:setup` records `tools: []` in the workflow file and the
tool-count gate is satisfied by the empty list. The literal value `N/A`
in the roadmap's per-spec sections maps to the empty list; it is not
submitted as a placeholder.

### I. Spec execution order and cross-spec state

Specs declare `Depends On` in the roadmap's Spec Index. Autopilot is a
single-spec executor; it does NOT orchestrate across specs. The operator
is responsible for serializing execution: SPEC-N's worktree must be cut
from a `main` that already contains SPEC-N-1's merged PR.

`/speckit-pro:setup` creates worktrees from the current tip of `main`.
Running setup for a downstream spec before its dependencies merge is
operator error and will cause consensus disagreement during
clarify/analyze.

### J. Strict new-module scope

Every spec that introduces new TypeScript or TSX modules must add those
files to the strict scope in `tsconfig.spec-strict.json` and
`eslint.config.mjs` as part of the same plan and implementation.

Spec `plan.md` files record this explicitly:

- List every new spec-owned TS/TSX file that enters strict scope.
- Mark strict scope `N/A` only for docs-only, migration-only, or
  no-new-module specs.
- Add future OpenClaw adapter files explicitly; do not rely on a broad
  `src/lib/openclaw-*` glob that would capture grandfathered code.

Until the post-pilot repo-wide hardening pass lands, existing upstream-owned
or grandfathered files remain outside this scoped strictness ramp.

## Development Workflow

### Commands

- `pnpm install` — install deps.
- `pnpm build` — build (standalone output).
- `pnpm dev` — development server on `localhost:3000`.
- `pnpm start` — production server (requires `node_modules`).
- `node .next/standalone/server.js` — standalone mode.
- `pnpm test` — Vitest unit tests.
- `pnpm test:e2e` — Playwright e2e.
- `pnpm typecheck` — `tsc -b --pretty false`.
- `pnpm lint` — ESLint.
- `pnpm test:all` — lint + typecheck + test + build + e2e.

### Commits

- Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`,
  `chore:`).
- Never add `Co-Authored-By` or similar AI-attribution trailers.
- Commit messages focus on the "why"; short subject line, body when
  context needs to persist.

### Worktrees

SpecKit-Pro uses `.worktrees/<number>-<short-name>/` for each spec under
execution. Work happens in the worktree, never on `main`. The branch is
pushed to `origin`; PR merge moves the spec to Complete.

### OpenClaw deployment note

Mission Control runs on the OpenClaw node from `~/mission-control-sync` on `main`.
Changes to `.specify/` and `.claude/` reach the running service on next
pull but are not required by `mc-start.sh` — they are operator-side
tooling only. If operator-side behavior changes, update the OpenClaw deployment section
of `CLAUDE.md`.

## Governance

This constitution supersedes ad-hoc practice. When this document and a
PRD or roadmap section disagree, this document wins until an amendment
is ratified.

Amendments require:

1. A PR that edits this file.
2. A stated Rationale.
3. A Migration Plan covering any existing code that violates the new
   rule.
4. Version bump per MAJOR.MINOR.PATCH:
   - MAJOR — incompatible principle change (e.g., drop upstream compat).
   - MINOR — new principle or new autopilot convention.
   - PATCH — clarification, typo, rewording without semantic change.
5. Update the `Last Amended` field below.

Compliance checkpoints:

- Every PR: `pnpm test:all` green, constitution principles self-checked
  by PR description, and applicable extensions (`speckit.verify`,
  `speckit.cleanup`, `speckit.review`) run where the extension hook
  fires.
- Every spec: `/speckit.analyze` produces no CRITICAL findings against
  this constitution.
- Every migration: rollback file present; upstream-compat checklist
  satisfied.

**Version**: 1.2.0 | **Ratified**: 2026-04-24 | **Last Amended**: 2026-04-26
