PRAGMA foreign_keys = OFF;

BEGIN IMMEDIATE;

DROP TABLE IF EXISTS workflow_templates__rollback_m54;

CREATE TABLE workflow_templates__rollback_m54 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  model TEXT NOT NULL DEFAULT 'sonnet',
  task_prompt TEXT NOT NULL,
  timeout_seconds INTEGER NOT NULL DEFAULT 300,
  agent_role TEXT,
  tags TEXT,
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_used_at INTEGER,
  use_count INTEGER NOT NULL DEFAULT 0,
  workspace_id INTEGER NOT NULL DEFAULT 1
);

INSERT INTO workflow_templates__rollback_m54 (
  id,
  name,
  description,
  model,
  task_prompt,
  timeout_seconds,
  agent_role,
  tags,
  created_by,
  created_at,
  updated_at,
  last_used_at,
  use_count,
  workspace_id
)
SELECT
  id,
  name,
  description,
  model,
  task_prompt,
  timeout_seconds,
  agent_role,
  tags,
  created_by,
  created_at,
  updated_at,
  last_used_at,
  use_count,
  workspace_id
FROM workflow_templates;

DROP INDEX IF EXISTS idx_workflow_templates_workspace_slug;
DROP TABLE workflow_templates;
ALTER TABLE workflow_templates__rollback_m54 RENAME TO workflow_templates;

CREATE INDEX IF NOT EXISTS idx_workflow_templates_name ON workflow_templates(name);
CREATE INDEX IF NOT EXISTS idx_workflow_templates_created_by ON workflow_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_workflow_templates_workspace_id ON workflow_templates(workspace_id);

DELETE FROM schema_migrations
WHERE id = '054_workflow_templates_task_chain_routing_and_artifact_policy';

COMMIT;

PRAGMA foreign_keys = ON;
