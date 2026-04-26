import { test, expect } from '@playwright/test'
import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const expectedRouteFiles = [
  'src/app/api/tasks/route.ts',
  'src/app/api/tasks/[id]/route.ts',
  'src/app/api/tasks/[id]/comments/route.ts',
  'src/app/api/tasks/[id]/broadcast/route.ts',
  'src/app/api/tasks/[id]/branch/route.ts',
  'src/app/api/tasks/queue/route.ts',
  'src/app/api/tasks/outcomes/route.ts',
  'src/app/api/tasks/regression/route.ts',
  'src/app/api/projects/route.ts',
  'src/app/api/projects/[id]/route.ts',
  'src/app/api/projects/[id]/agents/route.ts',
  'src/app/api/projects/[id]/tasks/route.ts',
  'src/app/api/agents/route.ts',
  'src/app/api/agents/[id]/route.ts',
  'src/app/api/agents/[id]/attribution/route.ts',
  'src/app/api/agents/[id]/diagnostics/route.ts',
  'src/app/api/agents/[id]/files/route.ts',
  'src/app/api/agents/[id]/heartbeat/route.ts',
  'src/app/api/agents/[id]/hide/route.ts',
  'src/app/api/agents/[id]/keys/route.ts',
  'src/app/api/agents/[id]/memory/route.ts',
  'src/app/api/agents/[id]/soul/route.ts',
  'src/app/api/agents/[id]/wake/route.ts',
  'src/app/api/agents/comms/route.ts',
  'src/app/api/agents/evals/route.ts',
  'src/app/api/agents/message/route.ts',
  'src/app/api/agents/optimize/route.ts',
  'src/app/api/agents/register/route.ts',
  'src/app/api/agents/sync/route.ts',
  'src/app/api/quality-review/route.ts',
  'src/app/api/chat/messages/route.ts',
  'src/app/api/chat/messages/[id]/route.ts',
  'src/app/api/chat/conversations/route.ts',
  'src/app/api/search/route.ts',
  'src/app/api/activities/route.ts',
  'src/app/api/notifications/route.ts',
  'src/app/api/notifications/deliver/route.ts',
  'src/app/api/status/route.ts',
  'src/app/api/audit/route.ts',
  'src/app/api/system-monitor/route.ts',
  'src/app/api/events/route.ts',
  'src/app/api/workspaces/route.ts',
  'src/app/api/workspaces/[id]/route.ts',
] as const

function listRouteFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry)
    if (statSync(fullPath).isDirectory()) return listRouteFiles(fullPath)
    return entry === 'route.ts' ? [fullPath] : []
  })
}

test.describe('SPEC-002 route discovery traceability', () => {
  test('keeps the generated Product Line scope matrix aligned with live API route files', () => {
    const discovered = new Set(
      listRouteFiles('src/app/api').map((filePath) => filePath.split(path.sep).join('/'))
    )

    for (const routeFile of expectedRouteFiles) {
      expect(existsSync(routeFile), `${routeFile} should exist`).toBe(true)
      expect(discovered.has(routeFile), `${routeFile} should be discoverable`).toBe(true)
    }
  })
})
