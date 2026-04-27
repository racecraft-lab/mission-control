import { test, expect, APIRequestContext } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { API_KEY_HEADER, enableWorkspaceSwitcherFlagForE2E } from './helpers'

type Workspace = {
  id: number
  slug: string
  name: string
  tenant_id: number
}

async function loadWorkspaceFixtures(request: APIRequestContext) {
  const res = await request.get('/api/workspaces', { headers: API_KEY_HEADER })
  expect(res.status()).toBe(200)
  const body = await res.json()
  const workspaces = body.workspaces as Workspace[]
  const facility = workspaces.find((workspace) => workspace.slug === 'facility' || workspace.name === 'Facility')
  const productLine = workspaces.find((workspace) => workspace.id !== facility?.id)
  expect(facility).toBeDefined()
  expect(productLine).toBeDefined()
  return { facility: facility!, productLine: productLine! }
}

async function openEventStream(path: string) {
  const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3005'
  const res = await fetch(new URL(path, baseURL), {
    headers: { 'x-api-key': API_KEY_HEADER['x-api-key'] },
  })
  const reader = res.body?.getReader()
  const first = reader ? await reader.read() : null
  await reader?.cancel()
  return {
    status: res.status,
    contentType: res.headers.get('content-type') ?? '',
    firstChunk: first?.value ? new TextDecoder().decode(first.value) : '',
  }
}

test.describe('Product Line SSE scope contract', () => {
  let restoreWorkspaceSwitcherFlag: () => void

  test.beforeAll(async ({ request }) => {
    restoreWorkspaceSwitcherFlag = await enableWorkspaceSwitcherFlagForE2E(request)
  })

  test.afterAll(() => {
    restoreWorkspaceSwitcherFlag?.()
  })

  test('authorizes Facility and Product Line event streams and rejects invalid setup scopes', async ({ request }) => {
    const { facility, productLine } = await loadWorkspaceFixtures(request)

    const facilityStream = await openEventStream('/api/events?workspace_scope=facility')
    expect(facilityStream.status).toBe(200)
    expect(facilityStream.contentType).toContain('text/event-stream')
    expect(facilityStream.firstChunk).toContain('"type":"connected"')

    const productLineStream = await openEventStream(`/api/events?workspace_id=${productLine.id}`)
    expect(productLineStream.status).toBe(200)
    expect(productLineStream.contentType).toContain('text/event-stream')
    expect(productLineStream.firstChunk).toContain('"type":"connected"')

    const conflict = await request.get(`/api/events?workspace_scope=facility&workspace_id=${productLine.id}`, { headers: API_KEY_HEADER })
    expect(conflict.status()).toBe(400)
    await expect(conflict.json()).resolves.toHaveProperty('error')

    const facilityRow = await request.get(`/api/events?workspace_id=${facility.id}`, { headers: API_KEY_HEADER })
    expect(facilityRow.status()).toBe(400)
    await expect(facilityRow.json()).resolves.toHaveProperty('error')

    const unauthorized = await request.get('/api/events?workspace_id=999999', { headers: API_KEY_HEADER })
    expect(unauthorized.status()).toBe(403)
    await expect(unauthorized.json()).resolves.toHaveProperty('error')
  })

  test('documents scoped event filtering, global allowlist, and workspace_id producer requirements', () => {
    const eventsScopeFilter = readFileSync('src/app/api/events/scope-filter.ts', 'utf8')
    const dbSource = readFileSync('src/lib/db.ts', 'utf8')
    const qualityReviewSource = readFileSync('src/app/api/quality-review/route.ts', 'utf8')
    const chatMessagesSource = readFileSync('src/app/api/chat/messages/route.ts', 'utf8')

    expect(eventsScopeFilter).toContain("new Set(['connected', 'connection.created', 'connection.disconnected'])")
    expect(eventsScopeFilter).toContain("typeof eventWorkspaceId !== 'number'")
    expect(eventsScopeFilter).toContain('return isGlobalEvent')
    expect(eventsScopeFilter).toContain("acceptedScope.kind === 'productLine'")
    expect(eventsScopeFilter).toContain('acceptedScope.workspaceIds.includes(eventWorkspaceId)')

    for (const [source, eventType] of [
      [dbSource, 'agent.status_changed'],
      [dbSource, 'notification.created'],
      [qualityReviewSource, 'task.status_changed'],
      [chatMessagesSource, 'chat.message'],
    ] as const) {
      const start = source.indexOf(`eventBus.broadcast('${eventType}'`)
      expect(start, `${eventType} broadcast should exist`).toBeGreaterThan(-1)
      expect(source.slice(start, start + 700), `${eventType} broadcast should include workspace_id`).toContain('workspace_id')
    }
  })
})
