import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import {
  resolveWorkspaceScopeFromRequest,
  workspaceScopeError,
  workspaceScopePredicate,
} from '@/lib/workspaces'

function formatTicketRef(prefix?: string | null, num?: number | null): string | undefined {
  if (!prefix || typeof num !== 'number' || !Number.isFinite(num) || num <= 0) return undefined
  return `${prefix}-${String(num).padStart(3, '0')}`
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const db = getDatabase()
    const acceptedScope = await resolveWorkspaceScopeFromRequest(db, request, auth.user)
    const workspaceFilter = workspaceScopePredicate(acceptedScope, 'p.workspace_id')
    const { id } = await params
    const projectId = Number.parseInt(id, 10)
    if (!Number.isFinite(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 })
    }
    const projectScope = db.prepare(`
      SELECT p.id, p.workspace_id
      FROM projects p
      JOIN workspaces w ON w.id = p.workspace_id
      WHERE p.id = ? AND ${workspaceFilter.sql} AND w.tenant_id = ?
      LIMIT 1
    `).get(projectId, ...workspaceFilter.params, acceptedScope.tenantId) as { workspace_id: number } | undefined
    if (!projectScope) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const workspaceId = projectScope.workspace_id

    const project = db.prepare(`
      SELECT id, workspace_id, name, slug, description, ticket_prefix, ticket_counter, status, created_at, updated_at
      FROM projects
      WHERE id = ? AND workspace_id = ?
    `).get(projectId, workspaceId)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const tasks = db.prepare(`
      SELECT t.*, p.name as project_name, p.ticket_prefix as project_prefix
      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id AND p.workspace_id = t.workspace_id
      WHERE t.workspace_id = ? AND t.project_id = ?
      ORDER BY t.created_at DESC
    `).all(workspaceId, projectId)

    return NextResponse.json({
      project,
      tasks: tasks.map((task: any) => ({
        ...task,
        tags: task.tags ? JSON.parse(task.tags) : [],
        metadata: task.metadata ? JSON.parse(task.metadata) : {},
        ticket_ref: formatTicketRef(task.project_prefix, task.project_ticket_no),
      }))
    })
  } catch (error) {
    const scopeError = workspaceScopeError(error)
    if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })
    logger.error({ err: error }, 'GET /api/projects/[id]/tasks error')
    return NextResponse.json({ error: 'Failed to fetch project tasks' }, { status: 500 })
  }
}
