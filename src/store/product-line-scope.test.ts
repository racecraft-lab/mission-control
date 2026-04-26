import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMissionControl, type Agent, type Project, type Task } from '@/store'
import { ACTIVE_WORKSPACE_STORAGE_KEY, parsePersistedProductLineScope, type ProductLine } from '@/types/product-line'

const productLine: ProductLine = {
  id: 42,
  slug: 'assembly',
  name: 'Assembly',
  tenant_id: 7,
}

const task = {
  id: 1,
  title: 'Scoped task',
  status: 'inbox',
  priority: 'medium',
  created_by: 'tester',
  created_at: 1,
  updated_at: 1,
} satisfies Task

const agent = {
  id: 1,
  name: 'Aegis',
  role: 'reviewer',
  status: 'idle',
  created_at: 1,
  updated_at: 1,
} satisfies Agent

const project = {
  id: 1,
  name: 'General',
  slug: 'general',
  ticket_prefix: 'GEN',
  status: 'active',
} satisfies Project

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

describe('Mission Control Product Line scope slice', () => {
  beforeEach(() => {
    installLocalStorage()
    localStorage.clear()
    useMissionControl.setState({
      workspaceSwitcherEnabled: true,
      currentUser: {
        id: 99,
        username: 'operator',
        display_name: 'Operator',
        role: 'operator',
        workspace_id: 1,
        tenant_id: 7,
      },
      workspaces: [productLine],
      activeProductLineScope: null,
      activeProductLine: null,
      scopeKey: 'uninitialized',
      activeProject: project,
      selectedTask: task,
      selectedAgent: agent,
      activeConversation: 'agent_Aegis',
      chatInput: 'draft',
      showProjectManagerModal: true,
      taskComments: { 1: [] },
      workspaceScopeNotice: null,
    })
  })

  it('sets and persists an authorized Product Line scope while clearing incompatible state', () => {
    useMissionControl.getState().setActiveProductLine(productLine, { source: 'user', broadcast: false, version: 123 })

    const state = useMissionControl.getState()
    expect(state.activeProductLine?.id).toBe(42)
    expect(state.activeProductLineScope).toMatchObject({
      kind: 'productLine',
      productLineId: 42,
      tenantId: 7,
      scopeKey: 'tenant:7:product-line:42',
    })
    expect(state.activeProject).toBeNull()
    expect(state.selectedTask).toBeNull()
    expect(state.selectedAgent).toBeNull()
    expect(state.activeConversation).toBeNull()
    expect(state.chatInput).toBe('')
    expect(state.showProjectManagerModal).toBe(false)
    expect(state.taskComments).toEqual({})

    const stored = parsePersistedProductLineScope(localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY))
    expect(stored).toEqual({
      payloadVersion: 1,
      tenantId: 7,
      productLineId: 42,
      scopeVersion: 123,
    })
  })

  it('rejects a real facility row as a Product Line selection', () => {
    useMissionControl.getState().setActiveProductLine({
      id: 3,
      slug: 'facility',
      name: 'Facility',
      tenant_id: 7,
    }, { source: 'user', broadcast: false })

    expect(useMissionControl.getState().activeProductLine).toBeNull()
    expect(useMissionControl.getState().workspaceScopeNotice).toBe('unauthorized-selection')
  })
})
