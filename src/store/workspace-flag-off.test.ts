import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMissionControl, type CurrentUser } from '@/store'
import { ACTIVE_WORKSPACE_STORAGE_KEY, appendScopeToPath } from '@/types/product-line'

const currentUser: CurrentUser = {
  id: 99,
  username: 'operator',
  display_name: 'Operator',
  role: 'operator',
  workspace_id: 1,
  tenant_id: 7,
}

const productLine = {
  id: 10,
  slug: 'assembly',
  name: 'Assembly',
  tenant_id: 7,
  feature_flags: '{"FEATURE_WORKSPACE_SWITCHER":true}',
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

function resetWorkspaceState() {
  localStorage.clear()
  localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, '{"payloadVersion":1,"tenantId":7,"productLineId":10,"scopeVersion":1}')
  useMissionControl.setState({
    currentUser,
    workspaces: [],
    workspaceListStatus: 'idle',
    workspaceScopeNotice: null,
    workspaceSwitcherEnabled: true,
    activeProductLineScope: null,
    activeProductLine: null,
    scopeKey: 'stale',
  })
}

describe('workspace switcher flag-off path', () => {
  beforeEach(() => {
    installLocalStorage()
    resetWorkspaceState()
    vi.stubEnv('FEATURE_WORKSPACE_SWITCHER', '0')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      tenant_id: 7,
      active_workspace_id: productLine.id,
      workspaces: [productLine],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('keeps legacy single-workspace behavior when FEATURE_WORKSPACE_SWITCHER is 0', async () => {
    await useMissionControl.getState().fetchWorkspaces()

    const state = useMissionControl.getState()
    expect(state.workspaceSwitcherEnabled).toBe(false)
    expect(state.activeProductLineScope).toBeNull()
    expect(state.activeProductLine).toBeNull()
    expect(state.scopeKey).toBe('uninitialized')
    expect(localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)).toBeNull()
    expect(appendScopeToPath('/api/projects?includeArchived=1', state.activeProductLineScope)).toBe('/api/projects?includeArchived=1')
  })
})
