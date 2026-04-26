import { NextRequest, NextResponse } from 'next/server'
import { getDatabase, Message } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { resolveWorkspaceScopeFromRequest, workspaceScopeError, workspaceScopePredicate } from '@/lib/workspaces'

/**
 * GET /api/chat/messages/[id] - Get a single message
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const db = getDatabase()
    const { id } = await params
    const acceptedScope = await resolveWorkspaceScopeFromRequest(db, request, auth.user)
    const workspaceFilter = workspaceScopePredicate(acceptedScope, 'workspace_id')

    const message = db
      .prepare(`SELECT * FROM messages WHERE id = ? AND ${workspaceFilter.sql}`)
      .get(parseInt(id), ...workspaceFilter.params) as Message | undefined

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    return NextResponse.json({
      message: {
        ...message,
        metadata: message.metadata ? JSON.parse(message.metadata) : null
      }
    })
  } catch (error) {
    const scopeError = workspaceScopeError(error)
    if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })
    logger.error({ err: error }, 'GET /api/chat/messages/[id] error')
    return NextResponse.json({ error: 'Failed to fetch message' }, { status: 500 })
  }
}

/**
 * PATCH /api/chat/messages/[id] - Mark message as read
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const db = getDatabase()
    const { id } = await params
    const acceptedScope = await resolveWorkspaceScopeFromRequest(db, request, auth.user)
    const workspaceFilter = workspaceScopePredicate(acceptedScope, 'workspace_id')
    const body = await request.json()

    const message = db
      .prepare(`SELECT * FROM messages WHERE id = ? AND ${workspaceFilter.sql}`)
      .get(parseInt(id), ...workspaceFilter.params) as Message | undefined

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }
    const workspaceId = (message as Message & { workspace_id: number }).workspace_id

    if (body.read) {
      const now = Math.floor(Date.now() / 1000)
      db.prepare('UPDATE messages SET read_at = ? WHERE id = ? AND workspace_id = ?').run(now, parseInt(id), workspaceId)
    }

    const updated = db
      .prepare('SELECT * FROM messages WHERE id = ? AND workspace_id = ?')
      .get(parseInt(id), workspaceId) as Message

    return NextResponse.json({
      message: {
        ...updated,
        metadata: updated.metadata ? JSON.parse(updated.metadata) : null
      }
    })
  } catch (error) {
    const scopeError = workspaceScopeError(error)
    if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })
    logger.error({ err: error }, 'PATCH /api/chat/messages/[id] error')
    return NextResponse.json({ error: 'Failed to update message' }, { status: 500 })
  }
}
