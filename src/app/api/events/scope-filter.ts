import type { ServerEvent } from '@/lib/event-bus'
import type { AcceptedWorkspaceScope } from '@/lib/workspaces'

const GLOBAL_EVENT_TYPES = new Set(['connected', 'connection.created', 'connection.disconnected'])

export function shouldForwardEventForScope(event: ServerEvent, acceptedScope: AcceptedWorkspaceScope): boolean {
  const eventWorkspaceId = event.data?.workspace_id
  const isGlobalEvent = GLOBAL_EVENT_TYPES.has(event.type)
  if (typeof eventWorkspaceId !== 'number') return isGlobalEvent
  if (acceptedScope.kind === 'productLine') return eventWorkspaceId === acceptedScope.workspaceId
  return acceptedScope.workspaceIds.includes(eventWorkspaceId)
}
