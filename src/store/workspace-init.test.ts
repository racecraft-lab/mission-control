import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMissionControl, type CurrentUser } from '@/store'
import { ACTIVE_WORKSPACE_STORAGE_KEY } from '@/types/product-line'

const currentUser: CurrentUser = {
  id: 99,
  username: 'operator',
  display_name: 'Operator',
  role: 'operator',
  workspace_id: 1,
  tenant_id: 7,
}

const assemblyWorkspace = {
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

function mockWorkspacesResponse(body: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })))
}

describe('workspace bootstrap flag resolution', () => {
  beforeEach(() => {
    installLocalStorage()
    resetWorkspaceState()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('resolves FEATURE_WORKSPACE_SWITCHER from the authenticated active workspace context', async () => {
    vi.stubEnv('FEATURE_WORKSPACE_SWITCHER', '1')
    mockWorkspacesResponse({
      tenant_id: 7,
      active_workspace_id: assemblyWorkspace.id,
      workspaces: [assemblyWorkspace],
    })

    await useMissionControl.getState().fetchWorkspaces()

    const state = useMissionControl.getState()
    expect(state.workspaceSwitcherEnabled).toBe(true)
    expect(state.activeProductLineScope).toMatchObject({
      kind: 'facility',
      tenantId: 7,
      scopeKey: 'tenant:7:facility',
    })
  })

  it('does not let env 1 force the switcher on without workspace feature flags', async () => {
    vi.stubEnv('FEATURE_WORKSPACE_SWITCHER', '1')
    mockWorkspacesResponse({
      tenant_id: 7,
      active_workspace_id: assemblyWorkspace.id,
      workspaces: [{
        ...assemblyWorkspace,
        feature_flags: null,
      }],
    })

    await useMissionControl.getState().fetchWorkspaces()

    const state = useMissionControl.getState()
    expect(state.workspaceSwitcherEnabled).toBe(false)
    expect(state.activeProductLineScope).toBeNull()
    expect(localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)).toBeNull()
  })
})
