PRAGMA foreign_keys = OFF;

BEGIN IMMEDIATE;

DROP TABLE IF EXISTS tasks__rollback_m55;

CREATE TABLE tasks__rollback_m55 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'inbox',
  priority TEXT NOT NULL DEFAULT 'medium',
  assigned_to TEXT,
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  due_date INTEGER,
  estimated_hours INTEGER,
  actual_hours INTEGER,
  tags TEXT,
  metadata TEXT,
  workspace_id INTEGER NOT NULL DEFAULT 1,
  project_id INTEGER,
  project_ticket_no INTEGER,
  outcome TEXT,
  error_message TEXT,
  resolution TEXT,
  feedback_rating INTEGER,
  feedback_notes TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  completed_at INTEGER,
  github_issue_number INTEGER,
  github_repo TEXT,
  github_synced_at INTEGER,
  github_branch TEXT,
  github_pr_number INTEGER,
  github_pr_state TEXT,
  dispatch_attempts INTEGER NOT NULL DEFAULT 0
);

INSERT INTO tasks__rollback_m55 (
  id,
  title,
  description,
  status,
  priority,
  assigned_to,
  created_by,
  created_at,
  updated_at,
  due_date,
  estimated_hours,
  actual_hours,
  tags,
  metadata,
  workspace_id,
  project_id,
  project_ticket_no,
  outcome,
  error_message,
  resolution,
  feedback_rating,
  feedback_notes,
  retry_count,
  completed_at,
  github_issue_number,
  github_repo,
  github_synced_at,
  github_branch,
  github_pr_number,
  github_pr_state,
  dispatch_attempts
)
SELECT
  id,
  title,
  description,
  status,
  priority,
  assigned_to,
  created_by,
  created_at,
  updated_at,
  due_date,
  estimated_hours,
  actual_hours,
  tags,
  metadata,
  workspace_id,
  project_id,
  project_ticket_no,
  outcome,
  error_message,
  resolution,
  feedback_rating,
  feedback_notes,
  retry_count,
  completed_at,
  github_issue_number,
  github_repo,
  github_synced_at,
  github_branch,
  github_pr_number,
  github_pr_state,
  dispatch_attempts
FROM tasks;

DROP INDEX IF EXISTS idx_tasks_workflow_template_id;
DROP INDEX IF EXISTS idx_tasks_workflow_template_slug;
DROP INDEX IF EXISTS idx_tasks_parent_task_id;
DROP INDEX IF EXISTS idx_tasks_root_task_id;
DROP INDEX IF EXISTS idx_tasks_chain_id;
DROP TABLE tasks;
ALTER TABLE tasks__rollback_m55 RENAME TO tasks;

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_project ON tasks(workspace_id, project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_outcome ON tasks(outcome);
CREATE INDEX IF NOT EXISTS idx_tasks_completed_at ON tasks(completed_at);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_outcome ON tasks(workspace_id, outcome, completed_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_github_issue
  ON tasks(workspace_id, github_repo, github_issue_number)
  WHERE github_issue_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_recurring
  ON tasks(workspace_id)
  WHERE json_extract(metadata, '$.recurrence.enabled') = 1;
CREATE INDEX IF NOT EXISTS idx_tasks_stale_inprogress
  ON tasks(status, updated_at)
  WHERE status = 'in_progress';

DELETE FROM schema_migrations
WHERE id = '055_tasks_workflow_template_binding_and_lineage';

COMMIT;

PRAGMA foreign_keys = ON;
