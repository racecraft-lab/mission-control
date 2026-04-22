import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const requireRoleMock = vi.fn(() => ({ user: { role: 'viewer', workspace_id: 1 } }))
const callOpenClawGatewayMock = vi.fn()
const loggerWarnMock = vi.fn()
const detectUnsupportedMcpEnvEntriesMock = vi.fn(() => ['mcp.servers.mission-control.env.FEATURE_FLAGS'])
const formatUnsupportedMcpEnvWarningMock = vi.fn((offenders: string[]) => (
  offenders.length > 0 ? `unsupported: ${offenders[0]}` : null
))
const loadFallbackNodesMock = vi.fn(async () => ([
  {
    id: 'hal-node',
    clientId: 'hal-node',
    displayName: 'HAL',
    platform: 'linux',
    version: '2026.4.15',
    roles: ['system'],
    connectedAt: 10,
    lastActivity: 20,
    status: 'offline',
  },
]))
const loadFallbackDevicesMock = vi.fn(() => ({
  devices: [
    {
      id: 'browser-device',
      deviceId: 'browser-device',
      displayName: 'OpenClaw Control UI',
    },
  ],
  pending: [
    {
      requestId: 'req-1',
      deviceId: 'pending-device',
      displayName: 'My Browser',
    },
  ],
}))

vi.mock('@/lib/auth', () => ({
  requireRole: requireRoleMock,
}))

vi.mock('@/lib/config', () => ({
  config: {
    gatewayHost: '127.0.0.1',
    gatewayPort: 8080,
    openclawStateDir: '/tmp/openclaw-state',
    openclawConfigPath: '/tmp/openclaw-config.json',
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    warn: loggerWarnMock,
    error: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock('@/lib/openclaw-gateway', () => ({
  callOpenClawGateway: callOpenClawGatewayMock,
}))

vi.mock('@/lib/openclaw-node-fallback', () => ({
  detectUnsupportedMcpEnvEntries: detectUnsupportedMcpEnvEntriesMock,
  formatUnsupportedMcpEnvWarning: formatUnsupportedMcpEnvWarningMock,
  loadFallbackNodes: loadFallbackNodesMock,
  loadFallbackDevices: loadFallbackDevicesMock,
}))

describe('nodes route fallback safeguards', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns fallback nodes and skips node.list RPC when config fallback warning is present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

    const { GET } = await import('@/app/api/nodes/route')
    const response = await GET(new NextRequest('http://localhost/api/nodes?action=list'))
    const payload = await response.json() as {
      nodes: Array<{ id: string }>
      connected: boolean
      degraded: boolean
      warning: string
    }

    expect(response.status).toBe(200)
    expect(payload.nodes).toEqual([
      expect.objectContaining({ id: 'hal-node' }),
    ])
    expect(payload.connected).toBe(true)
    expect(payload.degraded).toBe(true)
    expect(payload.warning).toContain('FEATURE_FLAGS')
    expect(loadFallbackNodesMock).toHaveBeenCalledWith('/tmp/openclaw-state', { gatewayReachable: true })
    expect(callOpenClawGatewayMock).not.toHaveBeenCalled()
  })

  it('returns fallback devices and skips device.pair.list RPC when config fallback warning is present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

    const { GET } = await import('@/app/api/nodes/route')
    const response = await GET(new NextRequest('http://localhost/api/nodes?action=devices'))
    const payload = await response.json() as {
      devices: Array<{ id: string }>
      pending: Array<{ requestId: string }>
      degraded: boolean
      warning: string
    }

    expect(response.status).toBe(200)
    expect(payload.devices).toEqual([
      expect.objectContaining({ id: 'browser-device' }),
    ])
    expect(payload.pending).toEqual([
      expect.objectContaining({ requestId: 'req-1' }),
    ])
    expect(payload.degraded).toBe(true)
    expect(payload.warning).toContain('FEATURE_FLAGS')
    expect(loadFallbackDevicesMock).toHaveBeenCalledWith('/tmp/openclaw-state')
    expect(callOpenClawGatewayMock).not.toHaveBeenCalled()
  })
})
