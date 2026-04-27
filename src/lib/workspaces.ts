import type Database from 'better-sqlite3'
import { resolveFlag } from '@/lib/feature-flags'
import { isFacilityWorkspace } from '@/types/product-line'

export interface WorkspaceRecord {
  id: number
  slug: string
  name: string
  tenant_id: number
  feature_flags?: string | null
  created_at: number
  updated_at: number
}

export interface ProjectTenantRecord {
  id: number
  workspace_id: number
  tenant_id: number
}

export class ForbiddenError extends Error {
  readonly status = 403 as const
  constructor(message: string) {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export class BadWorkspaceScopeError extends Error {
  readonly status = 400 as const
  constructor(message: string) {
    super(message)
    this.name = 'BadWorkspaceScopeError'
  }
}

export interface AuthWorkspaceUser {
  id?: number
  username?: string
  workspace_id?: number
  tenant_id?: number
}

export interface AcceptedWorkspaceScope {
  kind: 'facility' | 'productLine' | 'legacy'
  tenantId: number
  workspaceIds: number[]
  workspaceId: number | null
  explicit: boolean
  featureEnabled: boolean
}

interface ScopeCarrier {
  source: 'query' | 'body'
  workspaceId?: string | undefined
  workspaceScope?: string | undefined
}

interface ResolveWorkspaceScopeOptions {
  body?: Record<string, unknown> | null
  requireExplicitWhenEnabled?: boolean
}

interface AccessAuditContext {
  actor?: string
  actorId?: number
  route?: string
  ipAddress?: string | null
  userAgent?: string | null
}

function logTenantAccessDenied(
  db: Database.Database,
  targetType: 'workspace' | 'project',
  targetId: number,
  tenantId: number,
  context: AccessAuditContext
) {
  db.prepare(`
    INSERT INTO audit_log (action, actor, actor_id, target_type, target_id, detail, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'tenant_access_denied',
    context.actor || 'unknown',
    context.actorId ?? null,
    targetType,
    targetId,
    JSON.stringify({
      tenant_id: tenantId,
      route: context.route || null,
    }),
    context.ipAddress ?? null,
    context.userAgent ?? null
  )
}

export function getWorkspaceForTenant(
  db: Database.Database,
  workspaceId: number,
  tenantId: number
): WorkspaceRecord | null {
  const row = db.prepare(`
    SELECT id, slug, name, tenant_id, feature_flags, created_at, updated_at
    FROM workspaces
    WHERE id = ? AND tenant_id = ?
    LIMIT 1
  `).get(workspaceId, tenantId) as WorkspaceRecord | undefined
  return row || null
}

export function listWorkspacesForTenant(
  db: Database.Database,
  tenantId: number
): WorkspaceRecord[] {
  return db.prepare(`
    SELECT id, slug, name, tenant_id, feature_flags, created_at, updated_at
    FROM workspaces
    WHERE tenant_id = ?
    ORDER BY CASE WHEN slug = 'default' THEN 0 ELSE 1 END, name COLLATE NOCASE ASC
  `).all(tenantId) as WorkspaceRecord[]
}

function getScopeCarriers(request: Request, body?: Record<string, unknown> | null): ScopeCarrier[] {
  const url = new URL(request.url)
  const carriers: ScopeCarrier[] = []
  const queryWorkspaceIds = url.searchParams.getAll('workspace_id')
  const queryWorkspaceScopes = url.searchParams.getAll('workspace_scope')
  if (queryWorkspaceIds.length > 1 || queryWorkspaceScopes.length > 1) {
    throw new BadWorkspaceScopeError('Duplicate workspace scope parameters')
  }
  if (queryWorkspaceIds.length === 1 || queryWorkspaceScopes.length === 1) {
    carriers.push({
      source: 'query',
      workspaceId: queryWorkspaceIds[0] ?? undefined,
      workspaceScope: queryWorkspaceScopes[0] ?? undefined,
    })
  }

  if (body && (
    Object.prototype.hasOwnProperty.call(body, 'workspace_id') ||
    Object.prototype.hasOwnProperty.call(body, 'workspace_scope')
  )) {
    carriers.push({
      source: 'body',
      workspaceId: typeof body.workspace_id === 'string' || typeof body.workspace_id === 'number'
        ? String(body.workspace_id)
        : undefined,
      workspaceScope: typeof body.workspace_scope === 'string'
        ? body.workspace_scope
        : undefined,
    })
  }

  if (carriers.length > 1) {
    throw new BadWorkspaceScopeError('Conflicting workspace scope carriers')
  }
  return carriers
}

function parseWorkspaceId(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null
  if (!/^\d+$/.test(raw)) {
    throw new BadWorkspaceScopeError('Invalid workspace_id')
  }
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new BadWorkspaceScopeError('Invalid workspace_id')
  }
  return value
}

export function resolveWorkspaceScope(
  db: Database.Database,
  request: Request,
  user: AuthWorkspaceUser,
  options: ResolveWorkspaceScopeOptions = {}
): AcceptedWorkspaceScope {
  const tenantId = user.tenant_id ?? 1
  const authWorkspaceId = user.workspace_id ?? 1
  const authWorkspace = getWorkspaceForTenant(db, authWorkspaceId, tenantId)
  const featureEnabled = resolveFlag('FEATURE_WORKSPACE_SWITCHER', {
    workspaceFlags: authWorkspace?.feature_flags ?? null,
  })
  const carriers = getScopeCarriers(request, options.body)
  const carrier = carriers[0]

  if (carrier && !featureEnabled) {
    throw new BadWorkspaceScopeError('Workspace scoping is disabled')
  }

  if (!carrier) {
    if (featureEnabled && options.requireExplicitWhenEnabled !== false) {
      throw new BadWorkspaceScopeError('workspace_id or workspace_scope=facility is required')
    }
    ensureTenantWorkspaceAccess(db, tenantId, authWorkspaceId)
    return {
      kind: 'legacy',
      tenantId,
      workspaceIds: [authWorkspaceId],
      workspaceId: authWorkspaceId,
      explicit: false,
      featureEnabled,
    }
  }

  const workspaceId = parseWorkspaceId(carrier.workspaceId)
  const workspaceScope = carrier.workspaceScope
  if (workspaceScope && workspaceScope !== 'facility') {
    throw new BadWorkspaceScopeError('Unsupported workspace_scope')
  }
  if (workspaceId !== null && workspaceScope === 'facility') {
    throw new BadWorkspaceScopeError('Use either workspace_id or workspace_scope=facility')
  }
  if (workspaceScope === 'facility') {
    const workspaces = listWorkspacesForTenant(db, tenantId)
    return {
      kind: 'facility',
      tenantId,
      workspaceIds: workspaces.map((workspace) => workspace.id),
      workspaceId: null,
      explicit: true,
      featureEnabled,
    }
  }
  if (workspaceId === null) {
    throw new BadWorkspaceScopeError('workspace_id or workspace_scope=facility is required')
  }

  const workspace = ensureTenantWorkspaceAccess(db, tenantId, workspaceId)
  if (isFacilityWorkspace(workspace)) {
    throw new BadWorkspaceScopeError('The facility workspace row is not a Product Line scope')
  }
  return {
    kind: 'productLine',
    tenantId,
    workspaceIds: [workspaceId],
    workspaceId,
    explicit: true,
    featureEnabled,
  }
}

async function readScopeBodyCarrier(request: Request): Promise<Record<string, unknown> | null> {
  if (request.method === 'GET' || request.method === 'HEAD') return null
  try {
    const contentType = request.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) return null
    const body = await request.clone().json()
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

export async function resolveWorkspaceScopeFromRequest(
  db: Database.Database,
  request: Request,
  user: AuthWorkspaceUser,
  options: ResolveWorkspaceScopeOptions = {}
): Promise<AcceptedWorkspaceScope> {
  const body = options.body ?? await readScopeBodyCarrier(request)
  return resolveWorkspaceScope(db, request, user, { ...options, body })
}

export function workspaceScopePredicate(
  scope: Pick<AcceptedWorkspaceScope, 'workspaceIds'>,
  column = 'workspace_id'
): { sql: string; params: number[] } {
  if (scope.workspaceIds.length === 0) {
    return { sql: '1 = 0', params: [] }
  }
  if (scope.workspaceIds.length === 1) {
    return { sql: `${column} = ?`, params: [scope.workspaceIds[0]] }
  }
  return {
    sql: `${column} IN (${scope.workspaceIds.map(() => '?').join(',')})`,
    params: scope.workspaceIds,
  }
}

export function agentWorkspaceScopePredicate(
  db: Database.Database,
  scope: AcceptedWorkspaceScope,
  column = 'workspace_id'
): { sql: string; params: number[] } {
  if (scope.kind !== 'productLine') {
    return workspaceScopePredicate(scope, column)
  }

  const facilityWorkspaceIds = listWorkspacesForTenant(db, scope.tenantId)
    .filter(isFacilityWorkspace)
    .map((workspace) => workspace.id)
  const visibleWorkspaceIds = [...new Set([...facilityWorkspaceIds, ...scope.workspaceIds])]
  return workspaceScopePredicate({ workspaceIds: visibleWorkspaceIds }, column)
}

export function workspaceScopeError(error: unknown): { error: string; status: 400 | 403 } | null {
  if (error instanceof BadWorkspaceScopeError || error instanceof ForbiddenError) {
    return { error: error.message, status: error.status }
  }
  return null
}

export function assertWorkspaceTenant(
  db: Database.Database,
  workspaceId: number,
  tenantId: number
): WorkspaceRecord {
  const workspace = getWorkspaceForTenant(db, workspaceId, tenantId)
  if (!workspace) {
    throw new Error('Workspace not found for tenant')
  }
  return workspace
}

export function ensureTenantWorkspaceAccess(
  db: Database.Database,
  tenantId: number,
  workspaceId: number,
  context: AccessAuditContext = {}
): WorkspaceRecord {
  const workspace = getWorkspaceForTenant(db, workspaceId, tenantId)
  if (!workspace) {
    logTenantAccessDenied(db, 'workspace', workspaceId, tenantId, context)
    throw new ForbiddenError('Workspace not accessible for tenant')
  }
  return workspace
}

export function ensureTenantProjectAccess(
  db: Database.Database,
  tenantId: number,
  projectId: number,
  context: AccessAuditContext = {}
): ProjectTenantRecord {
  const project = db.prepare(`
    SELECT p.id, p.workspace_id, w.tenant_id
    FROM projects p
    JOIN workspaces w ON w.id = p.workspace_id
    WHERE p.id = ?
    LIMIT 1
  `).get(projectId) as ProjectTenantRecord | undefined

  if (!project || project.tenant_id !== tenantId) {
    logTenantAccessDenied(db, 'project', projectId, tenantId, context)
    throw new ForbiddenError('Project not accessible for tenant')
  }

  return project
}
