import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMissionControl, type CurrentUser, type Project, type Task } from '@/store'
import { appendScopeToPath, createFacilityScope, createProductLineScope, type ProductLine } from '@/types/product-line'

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

const project: Project = {
  id: 5,
  name: 'General',
  slug: 'general',
  ticket_prefix: 'GEN',
  status: 'active',
}

const task: Task = {
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

describe('Product Line cache and URL ownership', () => {
  beforeEach(() => {
    installLocalStorage()
    useMissionControl.setState({
      currentUser,
      workspaces: [productLine],
      workspaceSwitcherEnabled: true,
      workspaceScopeNotice: null,
      activeProductLineScope: null,
      activeProductLine: null,
      scopeKey: 'uninitialized',
      activeProject: project,
      selectedTask: task,
      selectedAgent: null,
      activeConversation: 'agent_Aegis',
      chatInput: 'draft text',
      showProjectManagerModal: true,
      taskComments: { [task.id]: [] },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('owns request URLs by scopeKey-compatible query parameters', () => {
    const facility = createFacilityScope(7, 1)
    const scoped = createProductLineScope(productLine, 2)

    expect(appendScopeToPath('/api/tasks?limit=20&workspace_id=99', facility)).toBe('/api/tasks?limit=20&workspace_scope=facility')
    expect(appendScopeToPath('/api/tasks?limit=20&workspace_scope=facility', scoped)).toBe('/api/tasks?limit=20&workspace_id=42')
    expect(appendScopeToPath('/api/tasks?limit=20', null)).toBe('/api/tasks?limit=20')
  })

  it('fetches projects through the active Product Line scope', async () => {
    const scoped = createProductLineScope(productLine, 2)
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ projects: [project] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    useMissionControl.setState({
      activeProductLineScope: scoped,
      scopeKey: scoped.scopeKey,
      projects: [],
    })

    await useMissionControl.getState().fetchProjects()

    expect(fetchMock).toHaveBeenCalledWith('/api/projects?workspace_id=42', { cache: 'no-store' })
    expect(useMissionControl.getState().projects).toEqual([project])
  })

  it('resets unowned entity state and scoped cache state when the scope changes', () => {
    useMissionControl.getState().setActiveProductLine(productLine, {
      source: 'user',
      version: 500,
      broadcast: false,
    })

    const state = useMissionControl.getState()
    expect(state.scopeKey).toBe('tenant:7:product-line:42')
    expect(state.activeProject).toBeNull()
    expect(state.selectedTask).toBeNull()
    expect(state.selectedAgent).toBeNull()
    expect(state.activeConversation).toBeNull()
    expect(state.chatInput).toBe('')
    expect(state.showProjectManagerModal).toBe(false)
    expect(state.taskComments).toEqual({})
  })
})
