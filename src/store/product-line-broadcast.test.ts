import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentUser } from '@/store'
import type { ProductLineScopeMessage } from '@/types/product-line'

const currentUser: CurrentUser = {
  id: 99,
  username: 'operator',
  display_name: 'Operator',
  role: 'operator',
  workspace_id: 1,
  tenant_id: 7,
}

const productLine = {
  id: 42,
  slug: 'assembly',
  name: 'Assembly',
  tenant_id: 7,
  feature_flags: '{"FEATURE_WORKSPACE_SWITCHER":true}',
}

class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = []
  name: string
  onmessage: ((event: MessageEvent<ProductLineScopeMessage>) => void) | null = null
  postMessage = vi.fn()
  close = vi.fn()

  constructor(name: string) {
    this.name = name
    MockBroadcastChannel.instances.push(this)
  }
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

function installBroadcastChannel(value: unknown) {
  Object.defineProperty(window, 'BroadcastChannel', {
    configurable: true,
    value,
  })
  Object.defineProperty(globalThis, 'BroadcastChannel', {
    configurable: true,
    value,
  })
}

async function loadStore() {
  vi.resetModules()
  installLocalStorage()
  MockBroadcastChannel.instances = []
  installBroadcastChannel(MockBroadcastChannel)
  const { useMissionControl } = await import('@/store')
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
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    tenant_id: 7,
    active_workspace_id: productLine.id,
    workspaces: [productLine],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })))
  await useMissionControl.getState().fetchWorkspaces()
  return useMissionControl
}

describe('Product Line scope BroadcastChannel sync', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('publishes scope changes and accepts newer same-tenant updates from another tab', async () => {
    const useMissionControl = await loadStore()
    const channel = MockBroadcastChannel.instances[0]
    expect(channel?.name).toBe('mc:active-workspace')

    useMissionControl.getState().setActiveProductLine(productLine, {
      source: 'user',
      version: 10,
    })

    expect(channel.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      payloadVersion: 1,
      tenantId: 7,
      productLineId: 42,
      scopeVersion: 10,
      userId: 99,
    }))

    channel.onmessage?.({
      data: {
        payloadVersion: 1,
        tenantId: 7,
        productLineId: null,
        scopeVersion: 11,
        originTabId: 'other-tab',
        userId: 99,
      },
    } as MessageEvent<ProductLineScopeMessage>)

    expect(useMissionControl.getState().activeProductLineScope).toMatchObject({
      kind: 'facility',
      tenantId: 7,
      version: 11,
    })
  })

  it('rejects stale, wrong-tenant, and wrong-user broadcast updates', async () => {
    const useMissionControl = await loadStore()
    const channel = MockBroadcastChannel.instances[0]
    useMissionControl.getState().setActiveProductLine(productLine, {
      source: 'user',
      version: 20,
      broadcast: false,
    })

    for (const message of [
      { tenantId: 7, productLineId: null, scopeVersion: 19, userId: 99 },
      { tenantId: 8, productLineId: null, scopeVersion: 21, userId: 99 },
      { tenantId: 7, productLineId: null, scopeVersion: 22, userId: 100 },
    ]) {
      channel.onmessage?.({
        data: {
          payloadVersion: 1,
          originTabId: 'other-tab',
          ...message,
        },
      } as MessageEvent<ProductLineScopeMessage>)
    }

    expect(useMissionControl.getState().activeProductLineScope).toMatchObject({
      kind: 'productLine',
      productLineId: 42,
      version: 20,
    })
  })

  it('falls back without crashing when BroadcastChannel is unavailable', async () => {
    vi.resetModules()
    installLocalStorage()
    installBroadcastChannel(class {
      constructor() {
        throw new Error('BroadcastChannel blocked')
      }
    })

    const { useMissionControl } = await import('@/store')
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
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      tenant_id: 7,
      active_workspace_id: productLine.id,
      workspaces: [productLine],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })))

    await expect(useMissionControl.getState().fetchWorkspaces()).resolves.toBeUndefined()
    expect(() => useMissionControl.getState().setActiveProductLine(productLine, { source: 'user' })).not.toThrow()
    expect(useMissionControl.getState().activeProductLineScope).toMatchObject({
      kind: 'productLine',
      productLineId: 42,
    })
  })
})
