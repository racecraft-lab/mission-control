import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { syncAgentsFromConfig, previewSyncDiff } from '@/lib/agent-sync'
import { syncLocalAgents } from '@/lib/local-agent-sync'
import { logger } from '@/lib/logger'
import { getDatabase } from '@/lib/db'
import { resolveWorkspaceScopeFromRequest, workspaceScopeError } from '@/lib/workspaces'

/**
 * POST /api/agents/sync - Trigger agent config sync
 * ?source=local triggers local disk scan instead of openclaw.json sync.
 * Requires admin role.
 */
export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(request.url)
  const source = searchParams.get('source')

  try {
    const db = getDatabase()
    const acceptedScope = await resolveWorkspaceScopeFromRequest(db, request, auth.user)
    if (!acceptedScope.workspaceId) {
      return NextResponse.json({ error: 'workspace_id is required for agent sync' }, { status: 400 })
    }
    const workspaceId = acceptedScope.workspaceId

    if (source === 'local') {
      const result = await syncLocalAgents(workspaceId)
      return NextResponse.json(result)
    }

    const result = await syncAgentsFromConfig(auth.user.username, workspaceId)

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json(result)
  } catch (error: any) {
    const scopeError = workspaceScopeError(error)
    if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })
    logger.error({ err: error }, 'POST /api/agents/sync error')
    return NextResponse.json({ error: error.message || 'Sync failed' }, { status: 500 })
  }
}

/**
 * GET /api/agents/sync - Preview diff between openclaw.json and MC
 * Shows what would change without writing.
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const db = getDatabase()
    const acceptedScope = await resolveWorkspaceScopeFromRequest(db, request, auth.user)
    if (!acceptedScope.workspaceId) {
      return NextResponse.json({ error: 'workspace_id is required for agent sync preview' }, { status: 400 })
    }
    const diff = await previewSyncDiff(acceptedScope.workspaceId)
    return NextResponse.json(diff)
  } catch (error: any) {
    const scopeError = workspaceScopeError(error)
    if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })
    logger.error({ err: error }, 'GET /api/agents/sync error')
    return NextResponse.json({ error: error.message || 'Preview failed' }, { status: 500 })
  }
}
