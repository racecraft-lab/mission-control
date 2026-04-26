# Data Model: SPEC-001 Foundation Migrations

## Migration Map

| Migration | Entity / Surface | Change Type | Rollback Artifact |
|-----------|------------------|-------------|-------------------|
| `M53` | Agent Scope | Add column + targeted backfill | `docs/migrations/rollback-M53.sql` |
| `M54` | Workflow Template Routing Metadata | Add columns + partial unique index | `docs/migrations/rollback-M54.sql` |
| `M55` | Task Lineage Record | Add columns + lineage indexes | `docs/migrations/rollback-M55.sql` |
| `M56` | Workspace Feature Flag Set | Add column | `docs/migrations/rollback-M56.sql` |
| `M57` | Task Disposition | New table + indexes | `docs/migrations/rollback-M57.sql` |
| `M58` | Task Artifact | New table + indexes | `docs/migrations/rollback-M58.sql` |
| `M59` | Facility Workspace | Seed / rerun-safe insert | `docs/migrations/rollback-M59.sql` |
| `M60` | Resource Policy | New table + indexes | `docs/migrations/rollback-M60.sql` |
| `M61` | Resource Policy Event | New table + indexes | `docs/migrations/rollback-M61.sql` |

## Entity: Agent Scope

- **Storage**: Add `agents.scope`
- **Purpose**: Distinguish global agents from workspace-bound agents without changing `agents.workspace_path`
- **Fields**:
  - `scope`: text classification for `workspace` vs `global`
- **Initialization / Backfill**:
  - Default existing rows to workspace-local behavior
  - Backfill `global` only for `Aegis`, `Security Guardian`, and `HAL` using case-insensitive name matching
- **Validation rules**:
  - Preserve `agents.workspace_path`
  - No rename to `sandbox_path`
  - No unrelated assignment-schema changes

## Entity: Workflow Template Routing Metadata

- **Storage**: Extend `workflow_templates`
- **Purpose**: Persist the metadata later specs need for chaining, routing, output handling, PR production, terminal behavior, and artifact policy
- **Proposed fields**:
  - `slug`: nullable stable identifier for template lookup
  - `routing_rules`: text/JSON rules payload
  - `next_template_slug`: nullable successor reference for simple chaining
  - `output_schema`: text/JSON output expectation payload
  - `produces_pr`: integer boolean flag, default off
  - `external_terminal_event`: nullable external event name emitted at terminal chain states
  - `allow_redacted_artifacts`: integer boolean flag, default off
- **Indexes / constraints**:
  - Deterministic partial unique index on `(workspace_id, slug)` where `slug IS NOT NULL`
- **Validation rules**:
  - Keep `workflow_templates` as the live table
  - Use rerun-safe column and index guards

## Entity: Task Lineage Record

- **Storage**: Extend `tasks`
- **Purpose**: Track the template origin and parent/ancestor relationships needed for downstream task chaining
- **Proposed fields**:
  - `workflow_template_id`: nullable reference to the originating template
  - `workflow_template_slug`: nullable denormalized template slug for chain/artifact correlation
  - `parent_task_id`: nullable reference to the immediate upstream task
  - `root_task_id`: nullable reference to the originating chain root
  - `chain_id`: nullable stable identifier for all tasks in one chain
  - `chain_stage`: nullable numeric stage within a chain
- **Indexes**:
  - Indexes for template-origin queries
  - Indexes for parent/root traversal and chain lookup
- **Validation rules**:
  - Preserve existing `tasks.status`
  - Do not add or rebuild a DB `CHECK` for status vocabulary

## Entity: Workspace Feature Flag Set

- **Storage**: Add `workspaces.feature_flags`
- **Purpose**: Persist per-workspace flag overrides before any runtime resolution work exists
- **Fields**:
  - `feature_flags`: nullable text storing JSON
- **Validation rules**:
  - Storage only in SPEC-001
  - No `resolveFlag()` implementation or runtime evaluation in this spec

## Entity: Task Disposition

- **Storage**: New `task_dispositions` table
- **Purpose**: Persist explicit task handoff / resolution outcomes for later workflow orchestration and auditability
- **Proposed fields**:
  - `id`
  - `task_id`
  - `workspace_id`
  - `disposition`
  - `reason`
  - `triaged_by_agent_id`
  - `triaged_at`
- **Indexes**:
  - Lookup by `task_id`
  - Lookup by `(workspace_id, triaged_at)`
  - Lookup by `disposition`

## Entity: Task Artifact

- **Storage**: New `task_artifacts` table
- **Purpose**: Persist task-produced artifacts with enough metadata for chronology, workspace lookup, and later governance work
- **Proposed fields**:
  - `id`
  - `task_id`
  - `workspace_id`
  - `project_id`
  - `producer_agent_id`
  - `workflow_template_slug`
  - `artifact_type`
  - `schema_version`
  - `storage_kind`
  - `content_json`
  - `content_markdown`
  - `storage_uri`
  - `original_filename`
  - `mime_type`
  - `sha256`
  - `byte_size`
  - `preview_text`
  - `redaction_status`
  - `security_scan_status`
  - `supersedes_artifact_id`
  - `created_at`
- **Indexes**:
  - Lookup by `task_id, created_at`
  - Lookup by `workspace_id, artifact_type`
  - Lookup by `workflow_template_slug`

## Entity: Facility Workspace

- **Storage**: Rerun-safe seed in `workspaces`
- **Purpose**: Ensure one workspace row exists for the facility context
- **Seed fields**:
  - `slug = 'facility'`
  - `name = 'Facility'` or the agreed canonical display label chosen during implementation
  - `tenant_id` resolved from the live tenant query ordering rule
- **Validation rules**:
  - Never insert duplicates
  - Leave an existing `facility` row unchanged on rerun
  - Never write `workspaces.display_name`

## Entity: Resource Policy

- **Storage**: New `resource_policies` table
- **Purpose**: Persist later governance rules for workspace or task resource access
- **Proposed fields**:
  - `id`
  - `workspace_id`
  - `project_id`
  - `agent_id`
  - `agent_role`
  - `task_status`
  - `workflow_template_slug`
  - `provider`
  - `model`
  - `policy_type`
  - `limit_kind`
  - `limit_value`
  - `period`
  - `timezone`
  - `schedule_json`
  - `enforcement`
  - `soft_threshold_pct`
  - `hard_threshold_pct`
  - `enabled`
  - `created_at`
  - `updated_at`
- **Indexes**:
  - Lookup by `(workspace_id, project_id, agent_id, policy_type, enabled)`
  - Lookup by `workflow_template_slug`
  - Lookup by `enabled`

## Entity: Resource Policy Event

- **Storage**: New `resource_policy_events` table
- **Purpose**: Persist audit history for policy decisions and changes over time
- **Proposed fields**:
  - `id`
  - `policy_id`
  - `task_id`
  - `agent_id`
  - `decision`
  - `reason`
  - `observed_value`
  - `limit_value`
  - `metadata`
  - `created_at`
- **Indexes**:
  - Lookup by `(policy_id, created_at)`
  - Lookup by `(task_id, created_at)`
  - Lookup by `created_at`

## Relationship Summary

- `workflow_templates` optionally relate to many `tasks` through `tasks.workflow_template_id`
- `tasks` optionally self-reference through `parent_task_id` and `root_task_id`
- `task_dispositions` belong to one task and one workspace
- `task_artifacts` belong to one task and one workspace
- `resource_policy_events` optionally point to one `resource_policy`, one task, and one agent
- The `facility` workspace belongs to the live default tenant selected at migration time

## Rollback Notes

- Column-removal rollback for `M53`, `M54`, `M55`, and `M56` uses transactional table rebuilds so the files can be replayed safely even after the SPEC-001 columns are already absent.
- Table-creation rollback for `M57`, `M58`, `M60`, and `M61` should drop indexes first, then drop tables with existence guards.
- Seed rollback for `M59` should only remove the SPEC-001-created `facility` row when doing so is safe and documented in the rollback file.
