import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { runMigrations } from '@/lib/migrations'

const migrationIdsThrough052 = [
  '001_init',
  '002_quality_reviews',
  '003_quality_review_status_backfill',
  '004_messages',
  '005_users',
  '006_workflow_templates',
  '007_audit_log',
  '008_webhooks',
  '009_pipelines',
  '010_settings',
  '011_alert_rules',
  '012_super_admin_tenants',
  '013_tenant_owner_gateway',
  '014_auth_google_approvals',
  '015_missing_indexes',
  '016_direct_connections',
  '017_github_sync',
  '018_token_usage',
  '019_webhook_retry',
  '020_claude_sessions',
  '021_workspace_isolation_phase1',
  '022_workspace_isolation_phase2',
  '023_workspace_isolation_phase3',
  '024_projects_support',
  '025_token_usage_task_attribution',
  '026_task_outcome_tracking',
  '027_enhanced_projects',
  '028_github_sync_v2',
  '029_link_workspaces_to_tenants',
  '032_adapter_configs',
  '033_skills',
  '034_agents_source',
  '035_api_keys_v2',
  '036_recurring_tasks_index',
  '037_security_audit',
  '038_agent_evals',
  '039_session_costs',
  '040_agent_api_keys',
  '041_gateway_health_logs',
  '042_agent_hidden',
  '043_hash_session_tokens',
  '044_spawn_history',
  '045_task_dispatch_attempts',
  '046_agent_runs',
  '047_agent_working_memory',
  '048_memory_fts',
  '049_agent_runtime_type',
  '050_mcp_call_receipt_signing',
  '051_security_audit_indexes',
  '052_recalculate_agent_trust_without_rate_limit_hits',
]

const phase0MigrationIds = [
  '053_agent_scope',
  '054_workflow_templates_task_chain_routing_and_artifact_policy',
  '055_tasks_workflow_template_binding_and_lineage',
  '056_workspace_feature_flags',
  '057_task_dispositions',
  '058_task_artifacts',
  '059_facility_workspace_seed',
  '060_resource_policies',
  '061_resource_policy_events',
]

const rollbackIds = ['M61', 'M60', 'M59', 'M58', 'M57', 'M56', 'M55', 'M54', 'M53']

const openDbs: Database.Database[] = []

afterEach(() => {
  while (openDbs.length > 0) {
    openDbs.pop()?.close()
  }
})

function createMigration052Database(): Database.Database {
  const db = new Database(':memory:')
  openDbs.push(db)

  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      linux_user TEXT NOT NULL UNIQUE,
      plan_tier TEXT NOT NULL DEFAULT 'standard',
      status TEXT NOT NULL DEFAULT 'pending',
      openclaw_home TEXT NOT NULL,
      workspace_root TEXT NOT NULL,
      gateway_port INTEGER,
      dashboard_port INTEGER,
      config TEXT NOT NULL DEFAULT '{}',
      created_by TEXT NOT NULL DEFAULT 'system',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      owner_gateway TEXT
    );

    CREATE TABLE workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      tenant_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    );

    CREATE TABLE agents (
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

    CREATE TABLE workflow_templates (
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

    CREATE TABLE tasks (
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
  `)

  const insertMigration = db.prepare('INSERT INTO schema_migrations (id) VALUES (?)')
  for (const id of migrationIdsThrough052) insertMigration.run(id)

  db.exec(`
    INSERT INTO tenants (id, slug, display_name, linux_user, status, openclaw_home, workspace_root, owner_gateway)
    VALUES
      (1, 'inactive-owner', 'Inactive Owner', 'inactive-owner', 'pending', '/tmp/inactive-openclaw', '/tmp/inactive-workspace', 'primary'),
      (2, 'active-owner', 'Active Owner', 'active-owner', 'active', '/tmp/active-openclaw', '/tmp/active-workspace', 'primary');

    INSERT INTO workspaces (id, slug, name, tenant_id)
    VALUES (1, 'default', 'Default Workspace', 2);

    INSERT INTO agents (name, role, workspace_id, workspace_path)
    VALUES
      ('Aegis', 'reviewer', 1, '/tmp/aegis'),
      ('Security Guardian', 'security', 1, '/tmp/security-guardian'),
      ('HAL', 'assistant', 1, '/tmp/hal'),
      ('Local Dev', 'developer', 1, '/tmp/local-dev');

    INSERT INTO workflow_templates (name, task_prompt, workspace_id)
    VALUES ('Research', 'Investigate the request', 1);

    INSERT INTO tasks (title, status, workspace_id, metadata)
    VALUES ('Existing task', 'inbox', 1, '{}');
  `)

  return db
}

function columns(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name)
}

function indexNames(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA index_list(${table})`).all() as Array<{ name: string }>).map((index) => index.name)
}

function tableSql(db: Database.Database, table: string): string {
  return (
    db
      .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(table) as { sql?: string } | undefined
  )?.sql ?? ''
}

function resetPhase0MigrationMarkers(db: Database.Database): void {
  const remove = db.prepare('DELETE FROM schema_migrations WHERE id = ?')
  for (const id of phase0MigrationIds) remove.run(id)
}

describe('SPEC-001 foundation migrations', () => {
  it('applies M53-M61 to a migration-052 production-shape database', () => {
    const db = createMigration052Database()

    runMigrations(db)

    expect(columns(db, 'agents')).toContain('scope')
    expect(columns(db, 'agents')).toContain('workspace_path')
    expect(columns(db, 'agents')).not.toContain('sandbox_path')

    const globalAgents = db
      .prepare(`
        SELECT name, scope
        FROM agents
        WHERE scope = 'global'
        ORDER BY lower(name)
      `)
      .all() as Array<{ name: string; scope: string }>
    expect(globalAgents).toEqual([
      { name: 'Aegis', scope: 'global' },
      { name: 'HAL', scope: 'global' },
      { name: 'Security Guardian', scope: 'global' },
    ])

    expect(columns(db, 'workflow_templates')).toEqual(
      expect.arrayContaining([
        'slug',
        'output_schema',
        'routing_rules',
        'next_template_slug',
        'produces_pr',
        'external_terminal_event',
        'allow_redacted_artifacts',
      ])
    )
    expect(indexNames(db, 'workflow_templates')).toContain('idx_workflow_templates_workspace_slug')
    const workflowTemplateSlugIndex = db
      .prepare(`SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_workflow_templates_workspace_slug'`)
      .get() as { sql: string } | undefined
    expect(workflowTemplateSlugIndex?.sql).toContain('WHERE slug IS NOT NULL')

    expect(columns(db, 'tasks')).toEqual(
      expect.arrayContaining([
        'workflow_template_id',
        'workflow_template_slug',
        'parent_task_id',
        'root_task_id',
        'chain_id',
        'chain_stage',
      ])
    )
    expect(tableSql(db, 'tasks')).not.toMatch(/CHECK\s*\(\s*status/i)

    expect(columns(db, 'workspaces')).toContain('feature_flags')
    const workspaceColumns = db.prepare(`PRAGMA table_info(workspaces)`).all() as Array<{
      name: string
      dflt_value: string | null
    }>
    const featureFlags = workspaceColumns.find((column) => column.name === 'feature_flags')
    expect(featureFlags?.dflt_value).toBeNull()

    expect(db.prepare(`SELECT COUNT(*) as c FROM task_dispositions`).get()).toEqual({ c: 0 })
    expect(db.prepare(`SELECT COUNT(*) as c FROM task_artifacts`).get()).toEqual({ c: 0 })
    expect(db.prepare(`SELECT COUNT(*) as c FROM resource_policies`).get()).toEqual({ c: 0 })
    expect(db.prepare(`SELECT COUNT(*) as c FROM resource_policy_events`).get()).toEqual({ c: 0 })

    expect(indexNames(db, 'task_artifacts')).toEqual(
      expect.arrayContaining(['idx_task_artifacts_task_created_at', 'idx_task_artifacts_workspace_type'])
    )
    expect(indexNames(db, 'resource_policies')).toContain('idx_resource_policies_scope')
    expect(indexNames(db, 'resource_policy_events')).toEqual(
      expect.arrayContaining(['idx_resource_policy_events_task', 'idx_resource_policy_events_created_at'])
    )

    const facility = db
      .prepare(`SELECT slug, name, tenant_id FROM workspaces WHERE slug = 'facility'`)
      .all() as Array<{ slug: string; name: string; tenant_id: number }>
    expect(facility).toEqual([{ slug: 'facility', name: 'Facility', tenant_id: 2 }])
  })

  it('reruns M53-M61 without duplicate schema objects or seed rows', () => {
    const db = createMigration052Database()

    runMigrations(db)
    const before = {
      facilityCount: (db.prepare(`SELECT COUNT(*) as c FROM workspaces WHERE slug = 'facility'`).get() as { c: number }).c,
      globalAgentCount: (db.prepare(`SELECT COUNT(*) as c FROM agents WHERE scope = 'global'`).get() as { c: number }).c,
      workflowTemplateColumns: columns(db, 'workflow_templates'),
      taskColumns: columns(db, 'tasks'),
      taskArtifactIndexes: indexNames(db, 'task_artifacts'),
      policyEventIndexes: indexNames(db, 'resource_policy_events'),
    }

    resetPhase0MigrationMarkers(db)

    expect(() => runMigrations(db)).not.toThrow()
    expect({
      facilityCount: (db.prepare(`SELECT COUNT(*) as c FROM workspaces WHERE slug = 'facility'`).get() as { c: number }).c,
      globalAgentCount: (db.prepare(`SELECT COUNT(*) as c FROM agents WHERE scope = 'global'`).get() as { c: number }).c,
      workflowTemplateColumns: columns(db, 'workflow_templates'),
      taskColumns: columns(db, 'tasks'),
      taskArtifactIndexes: indexNames(db, 'task_artifacts'),
      policyEventIndexes: indexNames(db, 'resource_policy_events'),
    }).toEqual(before)
  })

  it('keeps SPEC-001 no-runtime and no-rename safety gates intact', () => {
    const migrationsSource = readFileSync(join(process.cwd(), 'src', 'lib', 'migrations.ts'), 'utf8')
    const schemaSource = readFileSync(join(process.cwd(), 'src', 'lib', 'schema.sql'), 'utf8')
    const sqlSources = `${migrationsSource}\n${schemaSource}`

    expect(sqlSources).not.toMatch(/CHECK\s*\(\s*status/i)
    expect(sqlSources).not.toMatch(/ADD\s+COLUMN\s+sandbox_path/i)
    expect(sqlSources).not.toMatch(/ALTER\s+TABLE\s+agents\s+RENAME\s+COLUMN/i)
    expect(sqlSources).not.toMatch(/\bready_for_owner\b/i)
  })

  it('ships executable manual rollback artifacts for M53-M61', () => {
    const db = createMigration052Database()
    runMigrations(db)

    for (const id of rollbackIds) {
      const rollbackPath = join(process.cwd(), 'docs', 'migrations', `rollback-${id}.sql`)
      expect(existsSync(rollbackPath), rollbackPath).toBe(true)
      db.exec(readFileSync(rollbackPath, 'utf8'))
    }
    for (const id of rollbackIds) {
      const rollbackPath = join(process.cwd(), 'docs', 'migrations', `rollback-${id}.sql`)
      expect(() => db.exec(readFileSync(rollbackPath, 'utf8'))).not.toThrow()
    }

    expect(existsSync(join(process.cwd(), 'docs', 'migrations', 'rollback-procedure.md'))).toBe(true)
    expect(db.prepare(`SELECT id FROM schema_migrations WHERE id >= '053' AND id <= '061'`).all()).toEqual([])
    expect(columns(db, 'agents')).not.toContain('scope')
    expect(columns(db, 'workflow_templates')).not.toContain('slug')
    expect(columns(db, 'tasks')).not.toContain('workflow_template_id')
    expect(columns(db, 'workspaces')).not.toContain('feature_flags')

    const droppedTables = db
      .prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name IN ('task_dispositions', 'task_artifacts', 'resource_policies', 'resource_policy_events')
      `)
      .all()
    expect(droppedTables).toEqual([])
  })
})
