# Feature Specification: Spec Archive and Evidence Retention

**Feature Branch**: `[002a-spec-archive-evidence]`
**Created**: 2026-04-27
**Status**: Draft
**Input**: User description: "Create a future spec between SPEC-002 and SPEC-003 for managing growing SpecKit artifacts and screenshots. Evaluate adding https://github.com/stn1slv/spec-kit-archive."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Archive Completed Spec Knowledge (Priority: P1)

A maintainer can merge a completed feature and run a documented archive flow that preserves the feature's requirements, implementation evidence, PR links, and decisions in durable project memory without requiring every generated screenshot or temporary markdown artifact to remain permanently committed in `specs/`.

**Why this priority**: SPEC-002 added real UI journey screenshots as review evidence. Without an archive policy, each future UI spec can grow the repository with binary artifacts while still failing to provide a canonical post-merge memory.

**Independent Test**: Run the archive flow in dry-run mode against `specs/002-product-line-switcher` and verify it produces an archival report, durable memory updates, and a screenshot/evidence manifest without deleting source spec files.

**Acceptance Scenarios**:

1. **Given** a completed feature spec with spec, plan, tasks, quickstart, PR link, CI link, and screenshots, **When** the archive dry-run runs, **Then** it reports the durable memory changes, screenshot manifest, source paths, and no destructive actions.
2. **Given** a completed feature spec with no screenshots, **When** the archive dry-run runs, **Then** it still captures spec/plan/tasks evidence and reports that no screenshot evidence was present.
3. **Given** conflicting requirements between feature artifacts and canonical project memory, **When** the archive flow analyzes the feature, **Then** it stops for human decision instead of silently overwriting the canonical memory.

---

### User Story 2 - Keep Human Screenshot Review Without Repository Bloat (Priority: P1)

A reviewer can inspect the screenshots required for UI journey review from the PR description or CI artifacts, while long-lived repository history keeps only curated evidence summaries or intentionally retained images.

**Why this priority**: Human-in-the-loop screenshot review is now a constitutional quality gate, but committed screenshots should be the exception rather than the only way to preserve reviewability.

**Independent Test**: Run the SPEC-002 Playwright journey in CI and verify the PR evidence points to screenshots or an artifact bundle, while a guard reports whether committed screenshots exceed the approved policy.

**Acceptance Scenarios**:

1. **Given** a PR with new UI journey tests, **When** CI completes, **Then** the PR description includes a screenshot review section with links to the relevant images or artifact bundle.
2. **Given** `specs/**/screenshots` contains binary screenshots above the approved count or size cap, **When** the repository guard runs, **Then** it fails with the offending files and remediation instructions.
3. **Given** a small curated screenshot set has an approved manifest, **When** the repository guard runs, **Then** it allows those files and records why they are permanent evidence.

---

### User Story 3 - Enforce the Archive Policy Before Later Specs Start (Priority: P2)

A SpecKit executor preparing SPEC-003 or any later spec can follow documented constitution, workflow, and CI rules that define which artifacts are durable, which are temporary, and how post-merge archival is handled.

**Why this priority**: This is a process and repository hygiene dependency. It should land before SPEC-003 so the next feature branch does not copy the ad hoc SPEC-002 screenshot retention pattern.

**Independent Test**: Generate or inspect the next spec workflow and confirm it references the archive/evidence policy, the screenshot retention limits, and the post-merge archive command.

**Acceptance Scenarios**:

1. **Given** a future spec workflow is created, **When** the workflow template is rendered, **Then** it requires Playwright screenshot evidence and the archive/evidence retention policy.
2. **Given** a completed feature branch is ready to merge, **When** the pre-merge checks run, **Then** known UI journey defects, missing screenshot evidence, and oversized committed screenshot folders block the PR update.
3. **Given** a PR has merged, **When** the post-merge archive process is run, **Then** it creates durable memory/changelog updates and proposes any cleanup as an explicit reviewed change rather than silent deletion.

### Edge Cases

- GitHub Actions artifacts expire before a historical audit. The durable memory must still include PR URL, CI run URL, commit SHA, artifact names, and hashes or manifest entries.
- A branch is deleted after merge. Permanent evidence must not depend only on branch raw URLs.
- The upstream archive extension changes behavior after release. Adoption must pin a release or commit and record local modifications.
- The extension is unavailable or incompatible with the current SpecKit version. The implementation must provide a documented fallback path or defer adoption with evidence.
- A completed feature contains screenshots with sensitive data. The archive policy must require review, redaction, or exclusion before durable retention.
- CI cannot mutate the repository after merge. Cleanup must be implemented as a checked workflow, explicit follow-up PR, or manually invoked archive step, not as silent post-merge history rewriting.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST evaluate `stn1slv/spec-kit-archive` as the default archival mechanism and document whether it is adopted, vendored, pinned, forked, or rejected.
- **FR-002**: If adopted, the archive integration MUST pin a release tag or commit and record the upstream repository, license, version, and any local modifications.
- **FR-003**: The archive flow MUST preserve traceability from durable memory back to the source feature spec path, PR URL, merge commit, CI run, and screenshot evidence.
- **FR-004**: The archive flow MUST NOT delete or move source feature spec files automatically. Any cleanup of `specs/` content must happen through an explicit reviewed change.
- **FR-005**: The repository MUST define artifact classes for source-of-truth spec files, durable memory summaries, ephemeral CI artifacts, and permanent curated evidence.
- **FR-006**: The repository MUST define count and size limits for committed screenshot evidence under `specs/**/screenshots`.
- **FR-007**: CI MUST include a guard that fails when committed screenshots exceed the approved policy or lack a manifest/allowlist.
- **FR-008**: PR evidence requirements MUST include screenshot links or artifact bundle links for every new or changed UI journey covered by Playwright.
- **FR-009**: The constitution MUST be updated to mandate archive/evidence retention discipline for spec artifacts, screenshots, and post-merge memory.
- **FR-010**: SpecKit workflow templates or project workflow docs MUST require the archive/evidence policy before later feature specs are opened or updated.
- **FR-011**: The implementation MUST include a local and CI-runnable verification path for the archive guard and any adopted archive command.
- **FR-012**: The archive flow MUST stop for human decision when it detects constitution conflicts, requirement collisions, or destructive cleanup decisions.
- **FR-013**: Durable memory MUST include enough evidence for a future reviewer to understand what was implemented, how it was validated, and where the original detailed artifacts lived.
- **FR-014**: The cleanup strategy MUST avoid rewriting git history and MUST avoid depending on CI jobs that silently mutate `main` after merge.

### Key Entities

- **Archive Policy**: The repository rule set defining durable, temporary, and permanent-by-exception artifact classes.
- **Evidence Manifest**: A machine-readable or structured markdown record of screenshots, artifact bundles, hashes, PR URLs, CI runs, and source spec paths.
- **Archive Report**: The output of the archive command or dry-run, including changed memory files, source paths, conflicts, defaults, and follow-up cleanup recommendations.
- **Permanent Evidence Exception**: A documented approval for committed binary artifacts that exceed the default ephemeral artifact approach.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A dry-run archive against `specs/002-product-line-switcher` completes without deleting source files and reports durable memory updates plus screenshot evidence.
- **SC-002**: CI fails on an intentionally oversized or unmanifested screenshot fixture and names the offending file path.
- **SC-003**: CI passes for the approved SPEC-002 curated screenshot evidence or an approved artifact-bundle-only path.
- **SC-004**: The constitution and workflow docs state that future UI journey PRs must include screenshot review evidence and must not merge known UI journey defects.
- **SC-005**: A future SPEC-003 setup can identify SPEC-002A as complete and does not inherit an unresolved artifact retention decision.

## Assumptions

- SPEC-002 remains the current exemplar because it introduced real Playwright screenshots for a new UI journey.
- GitHub Actions artifact retention is acceptable for short-term review but not sufficient as the only durable historical record.
- Committed binary screenshots are allowed only when curated, small, and tied to a manifest or explicit exception.
- The upstream `spec-kit-archive` extension is a candidate implementation detail, not a constitutional dependency until this spec validates and pins it.
