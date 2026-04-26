-- SPEC-001 rollback M59: remove only the SPEC-001-created facility workspace seed.
-- Snapshot the database before running this file.
-- This delete is guarded so an in-use or operator-modified facility workspace is left in place.
-- Stable migration-052 workspace-scoped tables are checked explicitly so rollback
-- cannot orphan data if later specs or operators attached rows to the facility workspace.

PRAGMA foreign_keys = ON;

DELETE FROM workspaces
WHERE slug = 'facility'
  AND name = 'Facility'
  AND NOT EXISTS (
    SELECT 1
    FROM users
    WHERE users.workspace_id = workspaces.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM user_sessions
    WHERE user_sessions.workspace_id = workspaces.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM tasks
    WHERE tasks.workspace_id = workspaces.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM agents
    WHERE agents.workspace_id = workspaces.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM comments
    WHERE comments.workspace_id = workspaces.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM activities
    WHERE activities.workspace_id = workspaces.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM notifications
    WHERE notifications.workspace_id = workspaces.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM quality_reviews
    WHERE quality_reviews.workspace_id = workspaces.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM standup_reports
    WHERE standup_reports.workspace_id = workspaces.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM messages
    WHERE messages.workspace_id = workspaces.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM alert_rules
    WHERE alert_rules.workspace_id = workspaces.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM direct_connections
    WHERE direct_connections.workspace_id = workspaces.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM github_syncs
    WHERE github_syncs.workspace_id = workspaces.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM workflow_pipelines
    WHERE workflow_pipelines.workspace_id = workspaces.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pipeline_runs
    WHERE pipeline_runs.workspace_id = workspaces.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM workflow_templates
    WHERE workflow_templates.workspace_id = workspaces.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM webhooks
    WHERE webhooks.workspace_id = workspaces.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM webhook_deliveries
    WHERE webhook_deliveries.workspace_id = workspaces.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM token_usage
    WHERE token_usage.workspace_id = workspaces.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM projects
    WHERE projects.workspace_id = workspaces.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM adapter_configs
    WHERE adapter_configs.workspace_id = workspaces.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM api_keys
    WHERE api_keys.workspace_id = workspaces.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM security_events
    WHERE security_events.workspace_id = workspaces.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM agent_trust_scores
    WHERE agent_trust_scores.workspace_id = workspaces.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM mcp_call_log
    WHERE mcp_call_log.workspace_id = workspaces.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM eval_runs
    WHERE eval_runs.workspace_id = workspaces.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM eval_golden_sets
    WHERE eval_golden_sets.workspace_id = workspaces.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM eval_traces
    WHERE eval_traces.workspace_id = workspaces.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM agent_api_keys
    WHERE agent_api_keys.workspace_id = workspaces.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM spawn_history
    WHERE spawn_history.workspace_id = workspaces.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM runs
    WHERE runs.workspace_id = workspaces.id
  );

DELETE FROM schema_migrations
WHERE id = '059_facility_workspace_seed'
  AND NOT EXISTS (
    SELECT 1
    FROM workspaces
    WHERE slug = 'facility'
      AND name = 'Facility'
  );
