# Research: Spec Archive and Evidence Retention

**Feature**: SPEC-002A - Spec Archive and Evidence Retention
**Date**: 2026-04-27
**Status**: Draft

## Candidate: stn1slv/spec-kit-archive

Repository: <https://github.com/stn1slv/spec-kit-archive>

### Findings

- The project describes itself as a Spec-Kit extension for archiving merged features into main project memory.
- The extension declares `speckit.archive.run` in `extension.yml`, version `1.0.0`, with MIT license metadata and a SpecKit requirement of `>=0.1.0`.
- Its command archives a feature specification into `.specify/memory`, including spec, plan, changelog, and agent knowledge updates.
- The command requires `spec.md` and `plan.md`, inventories optional artifacts such as `tasks.md`, `research.md`, `data-model.md`, `contracts/`, `checklists/`, and `quickstart.md`, and emits an archival report with absolute paths.
- The command explicitly says not to delete the input feature spec files.
- The command supports hooks before and after archival through `.specify/extensions.yml`.

### Fit for Mission Control

The extension fits the provenance side of the problem: after a PR is merged, it can consolidate feature knowledge into canonical `.specify/memory` artifacts while retaining traceability to `specs/###-feature-name`.

It does not fully solve screenshot retention by itself. Mission Control still needs a local policy and CI guard for:

- Playwright screenshot artifact upload and PR description links.
- Permanent screenshot exceptions under `specs/**/screenshots`.
- Size/count limits for committed binary evidence.
- Hashes or manifests for screenshots and CI artifacts.
- A post-merge process that proposes cleanup through review instead of silently deleting files.

### Adoption Decision To Validate During SPEC-002A

Default proposal: adopt `spec-kit-archive` as the archive command candidate, pinned to a release tag or commit, unless implementation finds a compatibility, licensing, or behavior issue.

The implementation must validate:

- Exact installation method supported by the current SpecKit tooling in this repo.
- Whether a vendored copy is preferable to remote install in CI.
- Whether the command can run non-interactively for dry-run/reporting use cases.
- Whether hooks can trigger Mission Control's screenshot guard or evidence manifest checks.
- Whether local modifications are needed for the project's `docs/ai/specs` workflow files.

### Recommended Scope Boundary

SPEC-002A should not delete existing SPEC-002 screenshots from the branch that introduced them. It should instead define the policy, validate the archive path, and add guards so future specs have a controlled approach. Any cleanup of existing committed artifacts should happen only through an explicit follow-up PR after the durable evidence path exists.
