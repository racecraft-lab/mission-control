PRAGMA foreign_keys = OFF;

BEGIN IMMEDIATE;

DROP TABLE IF EXISTS workspaces__rollback_m56;

CREATE TABLE workspaces__rollback_m56 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tenant_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

INSERT INTO workspaces__rollback_m56 (
  id,
  slug,
  name,
  tenant_id,
  created_at,
  updated_at
)
SELECT
  id,
  slug,
  name,
  tenant_id,
  created_at,
  updated_at
FROM workspaces;

DROP TABLE workspaces;
ALTER TABLE workspaces__rollback_m56 RENAME TO workspaces;

CREATE INDEX IF NOT EXISTS idx_workspaces_slug ON workspaces(slug);
CREATE INDEX IF NOT EXISTS idx_workspaces_tenant_id ON workspaces(tenant_id);

DELETE FROM schema_migrations
WHERE id = '056_workspace_feature_flags';

COMMIT;

PRAGMA foreign_keys = ON;
