import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  detectUnsupportedMcpEnvEntries,
  formatUnsupportedMcpEnvWarning,
  loadFallbackDevices,
  loadFallbackNodes,
} from './openclaw-node-fallback'

describe('openclaw node fallback helpers', () => {
  test('ignores SecretRef-shaped MCP env entries', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-nodes-config-'))
    const configPath = path.join(tempDir, 'openclaw.json')
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        mcp: {
          servers: {
            'mission-control': {
              env: {
                MC_URL: 'http://127.0.0.1:3000',
                MC_API_KEY: { source: 'exec', provider: 'op', id: 'value' },
              },
            },
          },
        },
      }),
    )

    expect(detectUnsupportedMcpEnvEntries(configPath)).toEqual([])
    expect(formatUnsupportedMcpEnvWarning([])).toBeNull()

    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test('detects unsupported non-string MCP env entries', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-nodes-config-'))
    const configPath = path.join(tempDir, 'openclaw.json')
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        mcp: {
          servers: {
            'mission-control': {
              env: {
                MC_URL: 'http://127.0.0.1:3000',
                FEATURE_FLAGS: { enabled: true },
              },
            },
          },
        },
      }),
    )

    expect(detectUnsupportedMcpEnvEntries(configPath)).toEqual([
      'mcp.servers.mission-control.env.FEATURE_FLAGS',
    ])
    expect(formatUnsupportedMcpEnvWarning([
      'mcp.servers.mission-control.env.FEATURE_FLAGS',
    ])).toContain('FEATURE_FLAGS')

    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test('loads fallback nodes from the OpenClaw state directory', async () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-nodes-state-'))
    fs.mkdirSync(path.join(stateDir, 'nodes'), { recursive: true })
    fs.writeFileSync(
      path.join(stateDir, 'nodes', 'paired.json'),
      JSON.stringify({
        hal: {
          nodeId: 'hal-node',
          displayName: 'HAL',
          platform: 'linux',
          version: '2026.4.15',
          caps: ['system'],
          approvedAtMs: 10,
          lastConnectedAtMs: 20,
        },
      }),
    )

    await expect(loadFallbackNodes(stateDir)).resolves.toEqual([
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
    ])

    fs.rmSync(stateDir, { recursive: true, force: true })
  })

  test('overlays the local node with the current version when gateway fallback is used', async () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-nodes-local-state-'))
    fs.mkdirSync(path.join(stateDir, 'nodes'), { recursive: true })
    fs.writeFileSync(
      path.join(stateDir, 'nodes', 'paired.json'),
      JSON.stringify({
        paired: {
          nodeId: 'paired-id',
          displayName: 'HAL',
          platform: 'linux',
          version: '2026.4.5',
          caps: ['system'],
          approvedAtMs: 10,
          lastConnectedAtMs: 20,
        },
      }),
    )
    fs.writeFileSync(
      path.join(stateDir, 'node.json'),
      JSON.stringify({
        nodeId: 'local-id',
        displayName: 'HAL',
      }),
    )

    await expect(
      loadFallbackNodes(stateDir, {
        gatewayReachable: true,
        nowMs: () => 50,
        platform: 'linux',
        resolveCurrentVersion: async () => '2026.4.15',
      }),
    ).resolves.toEqual([
      {
        id: 'paired-id',
        clientId: 'paired-id',
        displayName: 'HAL',
        platform: 'linux',
        version: '2026.4.15',
        roles: ['system'],
        connectedAt: 10,
        lastActivity: 50,
        host: undefined,
        ip: undefined,
        status: 'online',
      },
    ])

    fs.rmSync(stateDir, { recursive: true, force: true })
  })

  test('loads fallback paired and pending devices from the OpenClaw state directory', () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-devices-state-'))
    fs.mkdirSync(path.join(stateDir, 'devices'), { recursive: true })
    fs.writeFileSync(
      path.join(stateDir, 'devices', 'paired.json'),
      JSON.stringify({
        browser: {
          deviceId: 'browser-device',
          displayName: 'OpenClaw Control UI',
          roles: ['operator'],
          scopes: ['operator.read'],
          approvedAtMs: 10,
          tokens: {
            operator: {
              lastUsedAtMs: 50,
            },
          },
        },
      }),
    )
    fs.writeFileSync(
      path.join(stateDir, 'devices', 'pending.json'),
      JSON.stringify({
        pending: {
          requestId: 'req-1',
          deviceId: 'pending-device',
          displayName: 'My Browser',
          role: 'operator',
          ts: 99,
        },
      }),
    )

    expect(loadFallbackDevices(stateDir)).toEqual({
      devices: [
        {
          id: 'browser-device',
          deviceId: 'browser-device',
          displayName: 'OpenClaw Control UI',
          publicKey: undefined,
          pairedAt: 10,
          lastSeen: 50,
          trusted: true,
          roles: ['operator'],
          scopes: ['operator.read'],
          tokens: [
            {
              role: 'operator',
              scopes: [],
              createdAtMs: undefined,
              rotatedAtMs: undefined,
              revokedAtMs: undefined,
              lastUsedAtMs: 50,
            },
          ],
          createdAtMs: undefined,
          approvedAtMs: 10,
        },
      ],
      pending: [
        {
          requestId: 'req-1',
          deviceId: 'pending-device',
          displayName: 'My Browser',
          role: 'operator',
          remoteIp: undefined,
          isRepair: undefined,
          ts: 99,
        },
      ],
    })

    fs.rmSync(stateDir, { recursive: true, force: true })
  })
})
