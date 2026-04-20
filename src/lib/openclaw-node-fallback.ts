import fs from 'node:fs'
import path from 'node:path'
import { runOpenClaw } from './command'

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

interface FallbackNodeOptions {
  gatewayReachable?: boolean
  nowMs?: () => number
  platform?: string
  resolveCurrentVersion?: () => Promise<string | undefined>
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

interface RawLocalNodeState {
  nodeId?: string
  displayName?: string
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

function isSecretRefLike(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.source === 'string'
    && typeof record.provider === 'string'
    && typeof record.id === 'string'
}

let openClawVersionCache: { value?: string; expiresAtMs: number } = {
  value: undefined,
  expiresAtMs: 0,
}

function parseOpenClawVersion(raw: string): string | undefined {
  const match = String(raw || '').match(/OpenClaw\s+([^\s]+)(?:\s|$)/i)
  return match?.[1]
}

async function resolveCurrentOpenClawVersion(): Promise<string | undefined> {
  const now = Date.now()
  if (openClawVersionCache.expiresAtMs > now) {
    return openClawVersionCache.value
  }
  try {
    const result = await runOpenClaw(['--version'], { timeoutMs: 3000 })
    const version = parseOpenClawVersion(result.stdout)
    openClawVersionCache = { value: version, expiresAtMs: now + 60_000 }
    return version
  } catch {
    openClawVersionCache = { value: undefined, expiresAtMs: now + 10_000 }
    return undefined
  }
}

function readLocalNodeState(stateDir: string): RawLocalNodeState | null {
  if (!stateDir) return null
  const nodePath = path.join(stateDir, 'node.json')
  return readJsonFile<RawLocalNodeState | null>(nodePath, null)
}

function findLocalNodeMatch(entries: PresenceEntry[], localNode: RawLocalNodeState): PresenceEntry | undefined {
  if (localNode.nodeId) {
    const exact = entries.find((entry) => entry.id === localNode.nodeId || entry.clientId === localNode.nodeId)
    if (exact) return exact
  }
  if (localNode.displayName) {
    const displayMatches = entries.filter((entry) => entry.displayName === localNode.displayName)
    if (displayMatches.length === 1) return displayMatches[0]
  }
  return undefined
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
      if (envValue && typeof envValue === 'object' && !isSecretRefLike(envValue)) {
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

export async function loadFallbackNodes(
  stateDir: string,
  options: FallbackNodeOptions = {},
): Promise<PresenceEntry[]> {
  if (!stateDir) return []
  const pairedPath = path.join(stateDir, 'nodes', 'paired.json')
  const paired = readJsonFile<JsonRecord<RawPairedNode>>(pairedPath, {})

  const entries = Object.entries(paired)
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

  const localNode = readLocalNodeState(stateDir)
  if (!localNode?.nodeId && !localNode?.displayName) {
    return entries.sort((left, right) => left.displayName.localeCompare(right.displayName))
  }

  const nowMs = options.nowMs?.() ?? Date.now()
  const matched = findLocalNodeMatch(entries, localNode)
  const currentVersion = await (options.resolveCurrentVersion ?? resolveCurrentOpenClawVersion)()
  const localEntry: PresenceEntry = {
    id: matched?.id || localNode.nodeId || localNode.displayName || 'local-node',
    clientId: matched?.clientId || localNode.nodeId || localNode.displayName || 'local-node',
    displayName: localNode.displayName || matched?.displayName || localNode.nodeId || 'Local Node',
    platform: matched?.platform || options.platform || process.platform,
    version: currentVersion || matched?.version || 'unknown',
    roles: matched?.roles?.length ? matched.roles : ['system'],
    connectedAt: matched?.connectedAt || nowMs,
    lastActivity: options.gatewayReachable ? nowMs : (matched?.lastActivity || 0),
    host: matched?.host,
    ip: matched?.ip,
    status: options.gatewayReachable ? 'online' : (matched?.status || 'offline'),
  }

  const filtered = entries.filter((entry) => {
    if (matched && (entry.id === matched.id || entry.clientId === matched.clientId)) return false
    if (!matched && localNode.displayName && entry.displayName === localNode.displayName) return false
    return true
  })

  return [...filtered, localEntry].sort((left, right) => left.displayName.localeCompare(right.displayName))
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
