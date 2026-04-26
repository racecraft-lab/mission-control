import { NextRequest, NextResponse } from 'next/server'
import { getDatabase, db_helpers } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { callOpenClawGateway } from '@/lib/openclaw-gateway'
import { resolveAgentSessionKey } from '@/lib/openclaw-agent-session'
import { agentWorkspaceScopePredicate, resolveWorkspaceScopeFromRequest, workspaceScopeError } from '@/lib/workspaces'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const resolvedParams = await params
    const agentId = resolvedParams.id
    const body = await request.json().catch(() => ({}))
    const customMessage =
      typeof body?.message === 'string' ? body.message.trim() : ''

    const db = getDatabase()
    const acceptedScope = await resolveWorkspaceScopeFromRequest(db, request, auth.user)
    const workspaceFilter = agentWorkspaceScopePredicate(db, acceptedScope, 'workspace_id')
    const agent: any = isNaN(Number(agentId))
      ? db.prepare(`SELECT * FROM agents WHERE name = ? AND ${workspaceFilter.sql}`).get(agentId, ...workspaceFilter.params)
      : db.prepare(`SELECT * FROM agents WHERE id = ? AND ${workspaceFilter.sql}`).get(Number(agentId), ...workspaceFilter.params)

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }
    const workspaceId = agent.workspace_id as number

    const sessionKey = resolveAgentSessionKey(agent)
    if (!sessionKey) {
      return NextResponse.json(
        { error: 'Agent has no routable OpenClaw session key configured' },
        { status: 400 }
      )
    }

    const message =
      customMessage ||
      `Wake up check-in for ${agent.name}. Please review assigned tasks and notifications.`

    const result = await callOpenClawGateway('sessions.send', { key: sessionKey, message }, 10_000)

    db_helpers.updateAgentStatus(agent.name, 'idle', 'Manual wake', workspaceId)

    return NextResponse.json({
      success: true,
      session_key: sessionKey,
      result
    })
  } catch (error) {
    const scopeError = workspaceScopeError(error)
    if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })
    logger.error({ err: error }, 'POST /api/agents/[id]/wake error')
    return NextResponse.json({ error: 'Failed to wake agent' }, { status: 500 })
  }
}
