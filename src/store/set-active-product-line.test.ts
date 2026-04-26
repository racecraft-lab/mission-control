import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMissionControl, type CurrentUser, type Project, type Task } from '@/store'
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
}

const activeProject: Project = {
  id: 5,
  name: 'General',
  slug: 'general',
  ticket_prefix: 'GEN',
  status: 'active',
}

const selectedTask: Task = {
  id: 12,
  title: 'Scoped task',
  status: 'inbox',
  priority: 'medium',
  created_by: 'operator',
  created_at: 1,
  updated_at: 1,
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

describe('setActiveProductLine', () => {
  beforeEach(() => {
    installLocalStorage()
    localStorage.clear()
    useMissionControl.setState({
      currentUser,
      activeTenant: {
        id: 7,
        display_name: 'RaceCraft Factory',
        slug: 'racecraft-factory',
        status: 'active',
        linux_user: 'racecraft',
      },
      workspaces: [productLine],
      workspaceSwitcherEnabled: true,
      workspaceScopeNotice: null,
      activeProductLineScope: null,
      activeProductLine: null,
      scopeKey: 'uninitialized',
      activeProject,
      selectedTask,
      selectedAgent: null,
      activeConversation: 'agent_Aegis',
      chatInput: 'draft text',
      showProjectManagerModal: true,
      taskComments: { [selectedTask.id]: [] },
    })
  })

  it('applies an authorized Product Line scope without mutating activeTenant', () => {
    const activeTenant = useMissionControl.getState().activeTenant

    useMissionControl.getState().setActiveProductLine(productLine, {
      source: 'user',
      version: 200,
      broadcast: false,
    })

    const state = useMissionControl.getState()
    expect(state.activeTenant).toBe(activeTenant)
    expect(state.activeProductLine).toEqual(productLine)
    expect(state.activeProductLineScope).toMatchObject({
      kind: 'productLine',
      productLineId: 42,
      tenantId: 7,
      version: 200,
      scopeKey: 'tenant:7:product-line:42',
    })
    expect(parsePersistedProductLineScope(localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY))).toEqual({
      payloadVersion: 1,
      tenantId: 7,
      productLineId: 42,
      scopeVersion: 200,
    })
  })

  it('clears incompatible scoped state on Facility/Product Line transition', () => {
    useMissionControl.getState().setActiveProductLine(productLine, {
      source: 'user',
      version: 201,
      broadcast: false,
    })

    const state = useMissionControl.getState()
    expect(state.activeProject).toBeNull()
    expect(state.selectedTask).toBeNull()
    expect(state.selectedAgent).toBeNull()
    expect(state.activeConversation).toBeNull()
    expect(state.chatInput).toBe('')
    expect(state.showProjectManagerModal).toBe(false)
    expect(state.taskComments).toEqual({})
  })

  it('rejects stale persisted Product Line scopes that no longer match authorized workspace rows', async () => {
    localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, JSON.stringify({
      payloadVersion: 1,
      tenantId: 7,
      productLineId: 404,
      scopeVersion: 99,
    }))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      tenant_id: 7,
      active_workspace_id: productLine.id,
      workspaces: [{ ...productLine, feature_flags: '{"FEATURE_WORKSPACE_SWITCHER":true}' }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })))

    await useMissionControl.getState().fetchWorkspaces()

    const state = useMissionControl.getState()
    expect(state.workspaceScopeNotice).toBe('unauthorized-selection')
    expect(state.activeProductLine).toBeNull()
    expect(state.activeProductLineScope?.kind).toBe('facility')
    expect(parsePersistedProductLineScope(localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY))?.productLineId).toBeNull()
  })
})
