import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { agentWorkspaceScopePredicate, resolveWorkspaceScopeFromRequest, workspaceScopeError } from '@/lib/workspaces'

/**
 * POST /api/agents/[id]/hide - Hide an agent from the UI
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const db = getDatabase()
    const { id } = await params
    const acceptedScope = await resolveWorkspaceScopeFromRequest(db, request, auth.user)
    const workspaceFilter = agentWorkspaceScopePredicate(db, acceptedScope, 'workspace_id')

    const idNum = Number(id)
    const agent = isNaN(idNum)
      ? db.prepare(`SELECT id, name, workspace_id FROM agents WHERE name = ? AND ${workspaceFilter.sql}`).get(id, ...workspaceFilter.params) as any
      : db.prepare(`SELECT id, name, workspace_id FROM agents WHERE id = ? AND ${workspaceFilter.sql}`).get(idNum, ...workspaceFilter.params) as any

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    db.prepare('UPDATE agents SET hidden = 1, updated_at = unixepoch() WHERE id = ? AND workspace_id = ?').run(agent.id, agent.workspace_id)

    return NextResponse.json({ success: true, agent_id: agent.id, hidden: true })
  } catch (error) {
    const scopeError = workspaceScopeError(error)
    if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })
    logger.error({ err: error }, 'POST /api/agents/[id]/hide error')
    return NextResponse.json({ error: 'Failed to hide agent' }, { status: 500 })
  }
}

/**
 * DELETE /api/agents/[id]/hide - Unhide an agent
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const db = getDatabase()
    const { id } = await params
    const acceptedScope = await resolveWorkspaceScopeFromRequest(db, request, auth.user)
    const workspaceFilter = agentWorkspaceScopePredicate(db, acceptedScope, 'workspace_id')

    const idNum = Number(id)
    const agent = isNaN(idNum)
      ? db.prepare(`SELECT id, name, workspace_id FROM agents WHERE name = ? AND ${workspaceFilter.sql}`).get(id, ...workspaceFilter.params) as any
      : db.prepare(`SELECT id, name, workspace_id FROM agents WHERE id = ? AND ${workspaceFilter.sql}`).get(idNum, ...workspaceFilter.params) as any

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    db.prepare('UPDATE agents SET hidden = 0, updated_at = unixepoch() WHERE id = ? AND workspace_id = ?').run(agent.id, agent.workspace_id)

    return NextResponse.json({ success: true, agent_id: agent.id, hidden: false })
  } catch (error) {
    const scopeError = workspaceScopeError(error)
    if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })
    logger.error({ err: error }, 'DELETE /api/agents/[id]/hide error')
    return NextResponse.json({ error: 'Failed to unhide agent' }, { status: 500 })
  }
}
