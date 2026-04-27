import { test, expect } from '@playwright/test'
import { API_KEY_HEADER, setDefaultWorkspaceSwitcherFlag } from './helpers'

test.describe('Product Line scope API contract', () => {
  let restoreWorkspaceSwitcherFlag: () => void

  test.beforeAll(() => {
    restoreWorkspaceSwitcherFlag = setDefaultWorkspaceSwitcherFlag(true)
  })

  test.afterAll(() => {
    restoreWorkspaceSwitcherFlag?.()
  })

  test('task route accepts Facility scope and rejects conflicting scope carriers', async ({ request }) => {
    const facilityRes = await request.get('/api/tasks?workspace_scope=facility', { headers: API_KEY_HEADER })
    expect(facilityRes.status()).toBe(200)

    const conflictRes = await request.get('/api/tasks?workspace_scope=facility&workspace_id=1', { headers: API_KEY_HEADER })
    expect(conflictRes.status()).toBe(400)
    await expect(conflictRes.json()).resolves.toHaveProperty('error')
  })

  test('task route rejects the real facility row and unauthorized workspace ids', async ({ request }) => {
    const workspacesRes = await request.get('/api/workspaces', { headers: API_KEY_HEADER })
    expect(workspacesRes.status()).toBe(200)
    const workspacesBody = await workspacesRes.json()
    const facility = workspacesBody.workspaces.find((workspace: any) => workspace.slug === 'facility')
    expect(facility).toBeDefined()

    const facilityRowRes = await request.get(`/api/tasks?workspace_id=${facility.id}`, { headers: API_KEY_HEADER })
    expect(facilityRowRes.status()).toBe(400)
    await expect(facilityRowRes.json()).resolves.toHaveProperty('error')

    const unauthorizedRes = await request.get('/api/tasks?workspace_id=999999', { headers: API_KEY_HEADER })
    expect(unauthorizedRes.status()).toBe(403)
    await expect(unauthorizedRes.json()).resolves.toHaveProperty('error')
  })
})
