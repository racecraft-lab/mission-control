import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMissionControl, type CurrentUser } from '@/store'
import { ACTIVE_WORKSPACE_STORAGE_KEY, parsePersistedProductLineScope, type ProductLine } from '@/types/product-line'

const currentUser: CurrentUser = {
  id: 99,
  username: 'operator',
  display_name: 'Operator',
  role: 'operator',
  workspace_id: 1,
  tenant_id: 7,
}

const productLine: ProductLine = {
  id: 42,
  slug: 'assembly',
  name: 'Assembly',
  tenant_id: 7,
  feature_flags: '{"FEATURE_WORKSPACE_SWITCHER":true}',
}

const facilityRow: ProductLine = {
  id: 3,
  slug: 'facility',
  name: 'Facility',
  tenant_id: 7,
  feature_flags: null,
}

function installLocalStorage() {
  const storage = new Map<string, string>()
  const fakeStorage = {
    get length() {
      return storage.size
    },
    key: vi.fn((index: number) => Array.from(storage.keys())[index] ?? null),
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, String(value))
    }),
    removeItem: vi.fn((key: string) => {
      storage.delete(key)
    }),
    clear: vi.fn(() => {
      storage.clear()
    }),
  } satisfies Storage

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: fakeStorage,
  })
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: fakeStorage,
  })
}

function resetStore() {
  useMissionControl.setState({
    currentUser,
    workspaces: [],
    workspaceListStatus: 'idle',
    workspaceScopeNotice: null,
    workspaceSwitcherEnabled: false,
    activeProductLineScope: null,
    activeProductLine: null,
    scopeKey: 'uninitialized',
  })
}

function mockWorkspaces() {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    tenant_id: 7,
    active_workspace_id: productLine.id,
    workspaces: [facilityRow, productLine],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })))
}

describe('Product Line scope persistence and hydration', () => {
  beforeEach(() => {
    installLocalStorage()
    localStorage.clear()
    resetStore()
    mockWorkspaces()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('hydrates a valid persisted Product Line scope for the authenticated tenant', async () => {
    localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, JSON.stringify({
      payloadVersion: 1,
      tenantId: 7,
      productLineId: 42,
      scopeVersion: 300,
    }))

    await useMissionControl.getState().fetchWorkspaces()

    const state = useMissionControl.getState()
    expect(state.activeProductLine).toMatchObject({ id: 42, slug: 'assembly' })
    expect(state.activeProductLineScope).toMatchObject({
      kind: 'productLine',
      productLineId: 42,
      version: 300,
    })
  })

  it('rejects wrong-tenant persisted scope and falls back to Facility', async () => {
    localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, JSON.stringify({
      payloadVersion: 1,
      tenantId: 8,
      productLineId: 42,
      scopeVersion: 301,
    }))

    await useMissionControl.getState().fetchWorkspaces()

    const persisted = parsePersistedProductLineScope(localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY))
    expect(useMissionControl.getState().activeProductLine).toBeNull()
    expect(useMissionControl.getState().activeProductLineScope?.kind).toBe('facility')
    expect(persisted?.tenantId).toBe(7)
    expect(persisted?.productLineId).toBeNull()
  })

  it('rejects malformed persisted scope and falls back to Facility', async () => {
    localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, '{"bad"')

    await useMissionControl.getState().fetchWorkspaces()

    const persisted = parsePersistedProductLineScope(localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY))
    expect(useMissionControl.getState().activeProductLine).toBeNull()
    expect(useMissionControl.getState().activeProductLineScope?.kind).toBe('facility')
    expect(persisted?.productLineId).toBeNull()
  })

  it('rejects a real facility row persisted as a Product Line', async () => {
    localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, JSON.stringify({
      payloadVersion: 1,
      tenantId: 7,
      productLineId: facilityRow.id,
      scopeVersion: 302,
    }))

    await useMissionControl.getState().fetchWorkspaces()

    const persisted = parsePersistedProductLineScope(localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY))
    expect(useMissionControl.getState().workspaceScopeNotice).toBe('unauthorized-selection')
    expect(useMissionControl.getState().activeProductLine).toBeNull()
    expect(useMissionControl.getState().activeProductLineScope?.kind).toBe('facility')
    expect(persisted?.productLineId).toBeNull()
  })
})
