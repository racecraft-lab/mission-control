PRAGMA foreign_keys = OFF;

BEGIN IMMEDIATE;

DROP TABLE IF EXISTS agents__rollback_m53;

CREATE TABLE agents__rollback_m53 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  session_key TEXT UNIQUE,
  soul_content TEXT,
  status TEXT NOT NULL DEFAULT 'offline',
  last_seen INTEGER,
  last_activity TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  config TEXT,
  workspace_id INTEGER NOT NULL DEFAULT 1,
  source TEXT DEFAULT 'manual',
  content_hash TEXT,
  workspace_path TEXT,
  hidden INTEGER NOT NULL DEFAULT 0,
  working_memory TEXT DEFAULT '',
  runtime_type TEXT DEFAULT NULL
);

INSERT INTO agents__rollback_m53 (
  id,
  name,
  role,
  session_key,
  soul_content,
  status,
  last_seen,
  last_activity,
  created_at,
  updated_at,
  config,
  workspace_id,
  source,
  content_hash,
  workspace_path,
  hidden,
  working_memory,
  runtime_type
)
SELECT
  id,
  name,
  role,
  session_key,
  soul_content,
  status,
  last_seen,
  last_activity,
  created_at,
  updated_at,
  config,
  workspace_id,
  source,
  content_hash,
  workspace_path,
  hidden,
  working_memory,
  runtime_type
FROM agents;

DROP TABLE agents;
ALTER TABLE agents__rollback_m53 RENAME TO agents;

CREATE INDEX IF NOT EXISTS idx_agents_session_key ON agents(session_key);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_workspace_id ON agents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agents_source ON agents(source);

DELETE FROM schema_migrations
WHERE id = '053_agent_scope';

COMMIT;

PRAGMA foreign_keys = ON;
