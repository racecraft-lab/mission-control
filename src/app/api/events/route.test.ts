import { describe, expect, it } from 'vitest'
import { shouldForwardEventForScope } from './scope-filter'
import type { AcceptedWorkspaceScope } from '@/lib/workspaces'
import type { ServerEvent } from '@/lib/event-bus'

function event(type: string, workspaceId?: number): ServerEvent {
  return {
    type,
    data: workspaceId === undefined ? {} : { workspace_id: workspaceId },
    timestamp: 1,
  }
}

const facilityScope: AcceptedWorkspaceScope = {
  kind: 'facility',
  tenantId: 10,
  workspaceIds: [1, 4],
  workspaceId: null,
  explicit: true,
  featureEnabled: true,
}

const productLineScope: AcceptedWorkspaceScope = {
  kind: 'productLine',
  tenantId: 10,
  workspaceIds: [4],
  workspaceId: 4,
  explicit: true,
  featureEnabled: true,
}

describe('SSE workspace filtering', () => {
  it('drops non-global events that do not carry a workspace_id', () => {
    expect(shouldForwardEventForScope(event('audit.security'), facilityScope)).toBe(false)
    expect(shouldForwardEventForScope(event('audit.security'), productLineScope)).toBe(false)
  })

  it('allows only the explicit connection events through without workspace_id', () => {
    expect(shouldForwardEventForScope(event('connected'), facilityScope)).toBe(true)
    expect(shouldForwardEventForScope(event('connection.created'), productLineScope)).toBe(true)
  })

  it('filters workspace-scoped events by accepted scope', () => {
    expect(shouldForwardEventForScope(event('task.updated', 4), facilityScope)).toBe(true)
    expect(shouldForwardEventForScope(event('task.updated', 99), facilityScope)).toBe(false)
    expect(shouldForwardEventForScope(event('task.updated', 4), productLineScope)).toBe(true)
    expect(shouldForwardEventForScope(event('task.updated', 1), productLineScope)).toBe(false)
  })
})
