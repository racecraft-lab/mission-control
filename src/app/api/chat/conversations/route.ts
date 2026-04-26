import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { resolveWorkspaceScopeFromRequest, workspaceScopeError, workspaceScopePredicate } from '@/lib/workspaces'

/**
 * GET /api/chat/conversations - List conversations derived from messages
 * Query params: agent (filter by participant), limit, offset
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const db = getDatabase()
    const { searchParams } = new URL(request.url)
    const acceptedScope = await resolveWorkspaceScopeFromRequest(db, request, auth.user)
    const workspaceFilter = workspaceScopePredicate(acceptedScope, 'm.workspace_id')

    const agent = searchParams.get('agent')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
    const offset = parseInt(searchParams.get('offset') || '0')

    let query: string
    const params: any[] = []

    if (agent) {
      // Get conversations where this agent is a participant
      query = `
        SELECT
          m.conversation_id,
          MAX(m.created_at) as last_message_at,
          COUNT(*) as message_count,
          COUNT(DISTINCT m.from_agent) + COUNT(DISTINCT CASE WHEN m.to_agent IS NOT NULL THEN m.to_agent END) as participant_count,
          SUM(CASE WHEN m.to_agent = ? AND m.read_at IS NULL THEN 1 ELSE 0 END) as unread_count
        FROM messages m
        WHERE ${workspaceFilter.sql} AND (m.from_agent = ? OR m.to_agent = ? OR m.to_agent IS NULL)
        GROUP BY m.conversation_id
        ORDER BY last_message_at DESC
        LIMIT ? OFFSET ?
      `
      params.push(agent, ...workspaceFilter.params, agent, agent, limit, offset)
    } else {
      query = `
        SELECT
          m.conversation_id,
          MAX(m.created_at) as last_message_at,
          COUNT(*) as message_count,
          COUNT(DISTINCT m.from_agent) + COUNT(DISTINCT CASE WHEN m.to_agent IS NOT NULL THEN m.to_agent END) as participant_count,
          0 as unread_count
        FROM messages m
        WHERE ${workspaceFilter.sql}
        GROUP BY m.conversation_id
        ORDER BY last_message_at DESC
        LIMIT ? OFFSET ?
      `
      params.push(...workspaceFilter.params, limit, offset)
    }

    const conversations = db.prepare(query).all(...params) as any[]

    // Prepare last message statement once (avoids N+1)
    const lastMessageFilter = workspaceScopePredicate(acceptedScope, 'workspace_id')
    const lastMsgStmt = db.prepare(`
      SELECT * FROM messages
      WHERE conversation_id = ? AND ${lastMessageFilter.sql}
      ORDER BY created_at DESC
      LIMIT 1
    `);

    const withLastMessage = conversations.map((conv) => {
      const lastMsg = lastMsgStmt.get(conv.conversation_id, ...lastMessageFilter.params) as any;

      return {
        ...conv,
        last_message: lastMsg
          ? {
              ...lastMsg,
              metadata: lastMsg.metadata ? JSON.parse(lastMsg.metadata) : null
            }
          : null
      }
    })

    // Get total count for pagination
    let countQuery: string
    const countParams: any[] = [...workspaceFilter.params]
    if (agent) {
      countQuery = `
        SELECT COUNT(DISTINCT m.conversation_id) as total
        FROM messages m
        WHERE ${workspaceFilter.sql} AND (m.from_agent = ? OR m.to_agent = ? OR m.to_agent IS NULL)
      `
      countParams.push(agent, agent)
    } else {
      const countFilter = workspaceScopePredicate(acceptedScope, 'workspace_id')
      countQuery = `SELECT COUNT(DISTINCT conversation_id) as total FROM messages WHERE ${countFilter.sql}`
      countParams.splice(0, countParams.length, ...countFilter.params)
    }
    const countRow = db.prepare(countQuery).get(...countParams) as { total: number }

    return NextResponse.json({ conversations: withLastMessage, total: countRow.total, page: Math.floor(offset / limit) + 1, limit })
  } catch (error) {
    const scopeError = workspaceScopeError(error)
    if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })
    logger.error({ err: error }, 'GET /api/chat/conversations error')
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
  }
}
