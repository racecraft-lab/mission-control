import type Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import {
  agentWorkspaceScopePredicate,
  BadWorkspaceScopeError,
  ensureTenantWorkspaceAccess,
  ensureTenantProjectAccess,
  ForbiddenError,
  resolveWorkspaceScope,
  resolveWorkspaceScopeFromRequest,
} from '@/lib/workspaces'

type Workspace = {
  id: number
  slug: string
  name: string
  tenant_id: number
  feature_flags?: string | null
  created_at: number
  updated_at: number
}

type Project = {
  id: number
  workspace_id: number
}

type AuditEvent = {
  action: string
  actor: string
  actor_id: number | null
  target_type: string | null
  target_id: number | null
  detail: string | null
  ip_address: string | null
  user_agent: string | null
}

class FakeDb {
  readonly workspaces: Workspace[] = [
    { id: 1, slug: 'default', name: 'Default', tenant_id: 10, feature_flags: '{"FEATURE_WORKSPACE_SWITCHER":true}', created_at: 1, updated_at: 1 },
    { id: 3, slug: 'facility', name: 'Facility', tenant_id: 10, feature_flags: null, created_at: 1, updated_at: 1 },
    { id: 4, slug: 'assembly', name: 'Assembly', tenant_id: 10, feature_flags: null, created_at: 1, updated_at: 1 },
    { id: 2, slug: 'other', name: 'Other', tenant_id: 20, created_at: 1, updated_at: 1 },
  ]

  readonly projects: Project[] = [
    { id: 101, workspace_id: 1 },
    { id: 202, workspace_id: 2 },
  ]

  readonly auditEvents: AuditEvent[] = []

  prepare(sql: string) {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()

    return {
      get: (...args: unknown[]) => {
        if (normalized.includes('from workspaces') && normalized.includes('where id = ? and tenant_id = ?')) {
          const workspaceId = Number(args[0])
          const tenantId = Number(args[1])
          return this.workspaces.find((w) => w.id === workspaceId && w.tenant_id === tenantId)
        }

        if (normalized.includes('from projects p') && normalized.includes('join workspaces w')) {
          const projectId = Number(args[0])
          const project = this.projects.find((p) => p.id === projectId)
          if (!project) return undefined
          const workspace = this.workspaces.find((w) => w.id === project.workspace_id)
          if (!workspace) return undefined
          return { id: project.id, workspace_id: project.workspace_id, tenant_id: workspace.tenant_id }
        }

        if (normalized.startsWith('select action, actor, target_type, target_id, detail from audit_log')) {
          const event = this.auditEvents[this.auditEvents.length - 1]
          if (!event) return undefined
          return {
            action: event.action,
            actor: event.actor,
            target_type: event.target_type || '',
            target_id: event.target_id || 0,
            detail: event.detail || '',
          }
        }

        if (normalized.startsWith('select action, target_type, target_id from audit_log')) {
          const event = this.auditEvents[this.auditEvents.length - 1]
          if (!event) return undefined
          return {
            action: event.action,
            target_type: event.target_type || '',
            target_id: event.target_id || 0,
          }
        }

        return undefined
      },
      all: (...args: unknown[]) => {
        if (normalized.includes('from workspaces') && normalized.includes('where tenant_id = ?')) {
          const tenantId = Number(args[0])
          return this.workspaces.filter((w) => w.tenant_id === tenantId)
        }
        return []
      },
      run: (...args: unknown[]) => {
        if (normalized.startsWith('insert into audit_log')) {
          this.auditEvents.push({
            action: String(args[0]),
            actor: String(args[1]),
            actor_id: (args[2] as number | null) ?? null,
            target_type: (args[3] as string | null) ?? null,
            target_id: (args[4] as number | null) ?? null,
            detail: (args[5] as string | null) ?? null,
            ip_address: (args[6] as string | null) ?? null,
            user_agent: (args[7] as string | null) ?? null,
          })
        }
        return { changes: 1 }
      }
    }
  }
}

function createTestDb(): Database.Database {
  return new FakeDb() as unknown as Database.Database
}

describe('tenant access guards', () => {
  it('allows workspace access for matching tenant', () => {
    const db = createTestDb()
    const workspace = ensureTenantWorkspaceAccess(db, 10, 1, {
      actor: 'alice',
      actorId: 1,
      route: '/api/projects',
    })
    expect(workspace.id).toBe(1)
    expect(workspace.tenant_id).toBe(10)
  })

  it('denies workspace access for foreign tenant and logs tenant_access_denied', () => {
    const db = createTestDb()
    expect(() =>
      ensureTenantWorkspaceAccess(db, 10, 2, {
        actor: 'alice',
        actorId: 1,
        route: '/api/projects',
        ipAddress: '127.0.0.1',
        userAgent: 'vitest',
      })
    ).toThrow(ForbiddenError)

    const event = db.prepare(`
      SELECT action, actor, target_type, target_id, detail
      FROM audit_log
      ORDER BY id DESC
      LIMIT 1
    `).get() as {
      action: string
      actor: string
      target_type: string
      target_id: number
      detail: string
    }

    expect(event.action).toBe('tenant_access_denied')
    expect(event.actor).toBe('alice')
    expect(event.target_type).toBe('workspace')
    expect(event.target_id).toBe(2)
    expect(event.detail).toContain('"tenant_id":10')
  })

  it('allows project access for matching tenant', () => {
    const db = createTestDb()
    const project = ensureTenantProjectAccess(db, 10, 101, {
      actor: 'alice',
      actorId: 1,
      route: '/api/projects/101',
    })
    expect(project.id).toBe(101)
    expect(project.workspace_id).toBe(1)
    expect(project.tenant_id).toBe(10)
  })

  it('denies project access for foreign tenant and logs tenant_access_denied', () => {
    const db = createTestDb()
    expect(() =>
      ensureTenantProjectAccess(db, 10, 202, {
        actor: 'alice',
        actorId: 1,
        route: '/api/projects/202',
      })
    ).toThrow(ForbiddenError)

    const event = db.prepare(`
      SELECT action, target_type, target_id
      FROM audit_log
      ORDER BY id DESC
      LIMIT 1
    `).get() as {
      action: string
      target_type: string
      target_id: number
    }

    expect(event.action).toBe('tenant_access_denied')
    expect(event.target_type).toBe('project')
    expect(event.target_id).toBe(202)
  })
})

describe('workspace scope resolution', () => {
  it('requires explicit scope when the workspace switcher flag is enabled', () => {
    const db = createTestDb()
    expect(() =>
      resolveWorkspaceScope(db, new Request('http://mc.test/api/tasks'), {
        workspace_id: 1,
        tenant_id: 10,
      })
    ).toThrow(BadWorkspaceScopeError)
  })

  it('rejects explicit scope carriers when the workspace switcher flag is disabled', () => {
    const db = createTestDb()
    const user = { workspace_id: 4, tenant_id: 10 }

    const legacyScope = resolveWorkspaceScope(db, new Request('http://mc.test/api/tasks'), user)
    expect(legacyScope.kind).toBe('legacy')
    expect(legacyScope.workspaceIds).toEqual([4])
    expect(legacyScope.featureEnabled).toBe(false)

    expect(() =>
      resolveWorkspaceScope(db, new Request('http://mc.test/api/tasks?workspace_id=1'), user)
    ).toThrow(BadWorkspaceScopeError)

    expect(() =>
      resolveWorkspaceScope(db, new Request('http://mc.test/api/tasks?workspace_scope=facility'), user)
    ).toThrow(BadWorkspaceScopeError)
  })

  it('accepts synthetic Facility scope and aggregates tenant workspace ids', () => {
    const db = createTestDb()
    const scope = resolveWorkspaceScope(db, new Request('http://mc.test/api/tasks?workspace_scope=facility'), {
      workspace_id: 1,
      tenant_id: 10,
    })
    expect(scope.kind).toBe('facility')
    expect(scope.workspaceIds).toEqual([1, 3, 4])
  })

  it('rejects the real facility row as a Product Line workspace id', () => {
    const db = createTestDb()
    expect(() =>
      resolveWorkspaceScope(db, new Request('http://mc.test/api/tasks?workspace_id=3'), {
        workspace_id: 1,
        tenant_id: 10,
      })
    ).toThrow(BadWorkspaceScopeError)
  })

  it('returns 403 semantics for a well-formed foreign workspace id', () => {
    const db = createTestDb()
    expect(() =>
      resolveWorkspaceScope(db, new Request('http://mc.test/api/tasks?workspace_id=2'), {
        workspace_id: 1,
        tenant_id: 10,
      })
    ).toThrow(ForbiddenError)
  })

  it('includes Facility/global agent workspaces in Product Line agent visibility', () => {
    const db = createTestDb()
    const scope = resolveWorkspaceScope(db, new Request('http://mc.test/api/agents?workspace_id=4'), {
      workspace_id: 1,
      tenant_id: 10,
    })
    const predicate = agentWorkspaceScopePredicate(db, scope, 'workspace_id')
    expect(predicate.sql).toBe('workspace_id IN (?,?)')
    expect(predicate.params).toEqual([3, 4])
  })

  it('accepts body-only scope carriers and rejects query/body conflicts', async () => {
    const db = createTestDb()
    const bodyScope = await resolveWorkspaceScopeFromRequest(
      db,
      new Request('http://mc.test/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Scoped task', workspace_id: 4 }),
      }),
      { workspace_id: 1, tenant_id: 10 },
    )
    expect(bodyScope.kind).toBe('productLine')
    expect(bodyScope.workspaceId).toBe(4)

    await expect(resolveWorkspaceScopeFromRequest(
      db,
      new Request('http://mc.test/api/tasks?workspace_scope=facility', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspace_id: 4 }),
      }),
      { workspace_id: 1, tenant_id: 10 },
    )).rejects.toThrow(BadWorkspaceScopeError)
  })
})
