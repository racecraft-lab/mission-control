import fs from 'node:fs'
import path from 'node:path'

export type PresenceStatus = 'online' | 'idle' | 'offline'

export interface PresenceEntry {
  id: string
  clientId: string
  displayName: string
  platform: string
  version: string
  roles: string[]
  connectedAt: number
  lastActivity: number
  host?: string
  ip?: string
  status: PresenceStatus
}

export interface DeviceTokenSummary {
  role: string
  scopes?: string[]
  createdAtMs?: number
  rotatedAtMs?: number
  revokedAtMs?: number
  lastUsedAtMs?: number
}

export interface PendingDevice {
  requestId: string
  deviceId: string
  displayName?: string
  role?: string
  remoteIp?: string
  isRepair?: boolean
  ts?: number
}

export interface PairedDevice {
  id: string
  deviceId: string
  displayName: string
  publicKey?: string
  pairedAt?: number
  lastSeen?: number
  trusted?: boolean
  roles?: string[]
  scopes?: string[]
  tokens?: DeviceTokenSummary[]
  createdAtMs?: number
  approvedAtMs?: number
}

type JsonRecord<T> = Record<string, T>

interface RawPairedNode {
  nodeId?: string
  displayName?: string
  platform?: string
  version?: string
  caps?: string[]
  createdAtMs?: number
  approvedAtMs?: number
  lastConnectedAtMs?: number
}

interface RawDeviceTokenSummary {
  role?: string
  scopes?: string[]
  createdAtMs?: number
  rotatedAtMs?: number
  revokedAtMs?: number
  lastUsedAtMs?: number
}

interface RawPairedDevice {
  deviceId?: string
  publicKey?: string
  displayName?: string
  role?: string
  roles?: string[]
  scopes?: string[]
  trusted?: boolean
  createdAtMs?: number
  approvedAtMs?: number
  pairedAt?: number
  lastSeen?: number
  remoteIp?: string
  tokens?: Record<string, RawDeviceTokenSummary>
}

interface RawPendingDevice {
  requestId?: string
  deviceId?: string
  displayName?: string
  role?: string
  remoteIp?: string
  isRepair?: boolean
  ts?: number
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!filePath || !fs.existsSync(filePath)) return fallback
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
  } catch {
    return fallback
  }
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function normalizeDeviceTokens(tokens: RawPairedDevice['tokens']): DeviceTokenSummary[] {
  if (!tokens || typeof tokens !== 'object') return []
  return Object.entries(tokens)
    .map(([role, token]) => ({
      role,
      scopes: normalizeStringArray(token?.scopes),
      createdAtMs: token?.createdAtMs,
      rotatedAtMs: token?.rotatedAtMs,
      revokedAtMs: token?.revokedAtMs,
      lastUsedAtMs: token?.lastUsedAtMs,
    }))
    .sort((left, right) => left.role.localeCompare(right.role))
}

function maxTimestamp(values: Array<number | undefined>): number | undefined {
  const defined = values.filter((value): value is number => typeof value === 'number' && value > 0)
  return defined.length > 0 ? Math.max(...defined) : undefined
}

export function detectUnsupportedMcpEnvEntries(configPath: string): string[] {
  const parsed = readJsonFile<Record<string, any> | null>(configPath, null)
  const servers = parsed?.mcp?.servers
  if (!servers || typeof servers !== 'object') return []

  const offenders: string[] = []
  for (const [serverName, serverConfig] of Object.entries(servers as Record<string, any>)) {
    const env = serverConfig?.env
    if (!env || typeof env !== 'object') continue
    for (const [envKey, envValue] of Object.entries(env as Record<string, unknown>)) {
      if (envValue && typeof envValue === 'object') {
        offenders.push(`mcp.servers.${serverName}.env.${envKey}`)
      }
    }
  }

  return offenders.sort()
}

export function formatUnsupportedMcpEnvWarning(offenders: string[]): string | null {
  if (offenders.length === 0) return null
  if (offenders.length === 1) {
    return `OpenClaw config contains an unsupported non-string MCP env entry at ${offenders[0]}. Showing fallback data from the OpenClaw state directory.`
  }
  return `OpenClaw config contains ${offenders.length} unsupported non-string MCP env entries, including ${offenders[0]}. Showing fallback data from the OpenClaw state directory.`
}

export function loadFallbackNodes(stateDir: string): PresenceEntry[] {
  if (!stateDir) return []
  const pairedPath = path.join(stateDir, 'nodes', 'paired.json')
  const paired = readJsonFile<JsonRecord<RawPairedNode>>(pairedPath, {})

  return Object.entries(paired)
    .map(([id, node]) => {
      const nodeId = node.nodeId || id
      const lastActivity = node.lastConnectedAtMs || 0
      return {
        id: nodeId,
        clientId: nodeId,
        displayName: node.displayName || nodeId,
        platform: node.platform || 'unknown',
        version: node.version || 'unknown',
        roles: normalizeStringArray(node.caps),
        connectedAt: node.approvedAtMs || node.createdAtMs || lastActivity,
        lastActivity,
        status: 'offline' as const,
      }
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
}

export function loadFallbackDevices(stateDir: string): {
  devices: PairedDevice[]
  pending: PendingDevice[]
} {
  if (!stateDir) return { devices: [], pending: [] }
  const pairedPath = path.join(stateDir, 'devices', 'paired.json')
  const pendingPath = path.join(stateDir, 'devices', 'pending.json')
  const paired = readJsonFile<JsonRecord<RawPairedDevice>>(pairedPath, {})
  const pending = readJsonFile<JsonRecord<RawPendingDevice>>(pendingPath, {})

  const devices = Object.entries(paired)
    .map(([id, device]) => {
      const deviceId = device.deviceId || id
      const tokens = normalizeDeviceTokens(device.tokens)
      return {
        id: deviceId,
        deviceId,
        displayName: device.displayName || deviceId,
        publicKey: device.publicKey,
        pairedAt: device.pairedAt || device.approvedAtMs || device.createdAtMs,
        lastSeen: maxTimestamp([device.lastSeen, ...tokens.map((token) => token.lastUsedAtMs)]),
        trusted: device.trusted !== false,
        roles: normalizeStringArray(device.roles?.length ? device.roles : device.role ? [device.role] : []),
        scopes: normalizeStringArray(device.scopes),
        tokens,
        createdAtMs: device.createdAtMs,
        approvedAtMs: device.approvedAtMs,
      }
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName))

  const pendingDevices = Object.entries(pending)
    .map(([id, device]) => ({
      requestId: device.requestId || id,
      deviceId: device.deviceId || id,
      displayName: device.displayName,
      role: device.role,
      remoteIp: device.remoteIp,
      isRepair: device.isRepair,
      ts: device.ts,
    }))
    .sort((left, right) => (right.ts || 0) - (left.ts || 0))

  return { devices, pending: pendingDevices }
}
