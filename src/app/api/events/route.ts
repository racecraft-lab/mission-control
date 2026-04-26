import { NextRequest , NextResponse } from 'next/server'
import { eventBus, ServerEvent } from '@/lib/event-bus'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { resolveWorkspaceScopeFromRequest, workspaceScopeError } from '@/lib/workspaces'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const GLOBAL_EVENT_TYPES = new Set(['connected', 'connection.created', 'connection.disconnected'])

/**
 * GET /api/events - Server-Sent Events stream for real-time DB mutations.
 * Clients connect via EventSource and receive JSON-encoded events.
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const db = getDatabase()
  let acceptedScope
  try {
    acceptedScope = await resolveWorkspaceScopeFromRequest(db, request, auth.user)
  } catch (error) {
    const scopeError = workspaceScopeError(error)
    if (scopeError) return NextResponse.json({ error: scopeError.error }, { status: scopeError.status })
    throw error
  }

  const encoder = new TextEncoder()

  // Cleanup function, set in start(), called in cancel()
  let cleanup: (() => void) | null = null

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected', data: null, timestamp: Date.now() })}\n\n`)
      )

      // Forward workspace-scoped server events to this SSE client
      const handler = (event: ServerEvent) => {
        const eventWorkspaceId = event.data?.workspace_id
        const isGlobalEvent = GLOBAL_EVENT_TYPES.has(event.type)
        if (acceptedScope.kind === 'productLine') {
          if (eventWorkspaceId !== acceptedScope.workspaceId && !isGlobalEvent) return
        } else if (
          typeof eventWorkspaceId === 'number' &&
          !acceptedScope.workspaceIds.includes(eventWorkspaceId)
        ) {
          return
        }
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          )
        } catch {
          // Client disconnected, cleanup will happen in cancel()
        }
      }

      eventBus.on('server-event', handler)

      // Heartbeat every 30s to keep connection alive through proxies
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch {
          clearInterval(heartbeat)
        }
      }, 30_000)

      cleanup = () => {
        eventBus.off('server-event', handler)
        clearInterval(heartbeat)
      }
    },

    cancel() {
      if (cleanup) {
        cleanup()
        cleanup = null
      }
    },
  })

  // Defense-in-depth: if the request is aborted (proxy timeout, network drop)
  // ensure we clean up the event listener even if cancel() doesn't fire.
  request.signal.addEventListener('abort', () => {
    if (cleanup) {
      cleanup()
      cleanup = null
    }
  }, { once: true })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  })
}
