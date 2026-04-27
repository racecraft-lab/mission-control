# SPEC-002A Workflow - Spec Archive and Evidence Retention

**Spec ID**: SPEC-002A
**Spec Directory**: `specs/002a-spec-archive-evidence`
**Branch Short Name**: `spec-archive-evidence`
**Status**: Pending
**Priority**: P1
**Depends On**: SPEC-002
**Blocks**: SPEC-003 and later feature specs

## Purpose

Define and implement Mission Control's policy for long-lived SpecKit artifacts, Playwright screenshots, PR evidence, and post-merge archival before SPEC-003 starts generating more spec evidence. Evaluate `stn1slv/spec-kit-archive` as the default archive extension and adopt it only after pinning and local/CI validation.

Candidate upstream extension: <https://github.com/stn1slv/spec-kit-archive>

## Source Artifacts

- Spec: `specs/002a-spec-archive-evidence/spec.md`
- Research: `specs/002a-spec-archive-evidence/research.md`
- Requirements checklist: `specs/002a-spec-archive-evidence/checklists/requirements.md`
- Roadmap source: `docs/ai/rc-factory-technical-roadmap.md`
- Constitution: `.specify/memory/constitution.md`

## Implementation Brief

1. Validate `spec-kit-archive` against the current SpecKit tooling and decide whether to install, vendor, fork, or reject it.
2. Add or document an archive command that can dry-run against `specs/002-product-line-switcher` and preserve traceability to PR, CI, commit, and screenshot evidence.
3. Add a screenshot/evidence manifest convention for UI journey specs.
4. Add a CI and local guard that fails on unbounded committed screenshots under `specs/**/screenshots`.
5. Update the constitution and workflow guidance so future specs distinguish durable memory, temporary CI artifacts, and permanent curated evidence.
6. Validate the guard and archive dry-run locally and in CI before updating any PR.

## Guardrails

- Do not delete or move existing source spec folders automatically.
- Do not rewrite git history.
- Do not depend on post-merge CI silently mutating `main`.
- Do not open or update a PR with known UI journey bugs, failing Playwright evidence, or screenshots that show user-visible defects.
- Treat committed screenshots as an exception that must be small, curated, and manifest-backed.

## Acceptance Evidence

- Archive dry-run output for `specs/002-product-line-switcher`.
- CI/local command proving the screenshot guard passes for approved evidence.
- Negative fixture or documented test proving the guard fails for oversized/unmanifested screenshots.
- Constitution diff showing archive/evidence retention discipline.
- Workflow/template diff showing future UI specs inherit the policy.

## Autopilot Notes

- This is a process/tooling spec, not a runtime feature flag spec.
- UI work is not expected unless documentation templates or PR body automation are UI-adjacent.
- Use the existing Docker-backed Playwright approach as evidence input, but do not rerun full browser journeys unless the implementation changes their commands or artifacts.
- If adopting the upstream extension requires network access, provide a pinned/vendored CI-safe path or reject adoption for this spec with evidence.
