import { test, expect, APIRequestContext } from '@playwright/test'
import { API_KEY_HEADER, enableWorkspaceSwitcherFlagForE2E } from './helpers'

type Workspace = {
  id: number
  slug: string
  name: string
  tenant_id: number
}

const scopedGetRoutes = [
  '/api/tasks',
  '/api/projects?includeArchived=1',
  '/api/agents',
  '/api/quality-review?taskIds=999999',
  '/api/chat/conversations',
  '/api/chat/messages?limit=1',
  '/api/search?q=scope-matrix-unlikely&limit=1',
  '/api/activities?limit=1',
  '/api/notifications?recipient=system',
  '/api/status?action=overview',
  '/api/status?action=dashboard',
  '/api/audit?limit=1',
  '/api/system-monitor',
] as const

function withScope(path: string, scope: Record<string, string | number>) {
  const url = new URL(path, 'http://mission-control.test')
  for (const [key, value] of Object.entries(scope)) {
    url.searchParams.set(key, String(value))
  }
  return `${url.pathname}${url.search}`
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

test.describe('Product Line scope route matrix', () => {
  let restoreWorkspaceSwitcherFlag: () => void

  test.beforeAll(async ({ request }) => {
    restoreWorkspaceSwitcherFlag = await enableWorkspaceSwitcherFlagForE2E(request)
  })

  test.afterAll(() => {
    restoreWorkspaceSwitcherFlag?.()
  })

  test('GET routes accept Facility/Product Line scope and reject invalid carriers', async ({ request }) => {
    const { facility, productLine } = await loadWorkspaceFixtures(request)

    for (const route of scopedGetRoutes) {
      const legacy = await request.get(route, { headers: API_KEY_HEADER })
      expect(legacy.status(), `${route} legacy omitted scope`).toBeLessThan(500)

      const facilityRes = await request.get(withScope(route, { workspace_scope: 'facility' }), { headers: API_KEY_HEADER })
      expect(facilityRes.status(), `${route} Facility scope`).toBe(200)

      const productLineRes = await request.get(withScope(route, { workspace_id: productLine.id }), { headers: API_KEY_HEADER })
      expect(productLineRes.status(), `${route} Product Line scope`).toBe(200)

      const conflictRes = await request.get(withScope(route, { workspace_scope: 'facility', workspace_id: productLine.id }), { headers: API_KEY_HEADER })
      expect(conflictRes.status(), `${route} conflicting scope carriers`).toBe(400)
      await expect(conflictRes.json(), `${route} conflicting scope error`).resolves.toHaveProperty('error')

      const facilityRowRes = await request.get(withScope(route, { workspace_id: facility.id }), { headers: API_KEY_HEADER })
      expect(facilityRowRes.status(), `${route} real facility row as Product Line`).toBe(400)
      await expect(facilityRowRes.json(), `${route} facility row error`).resolves.toHaveProperty('error')

      const unauthorizedRes = await request.get(withScope(route, { workspace_id: 999999 }), { headers: API_KEY_HEADER })
      expect(unauthorizedRes.status(), `${route} unauthorized Product Line scope`).toBe(403)
      await expect(unauthorizedRes.json(), `${route} unauthorized scope error`).resolves.toHaveProperty('error')
    }
  })
})
