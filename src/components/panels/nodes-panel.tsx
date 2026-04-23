'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

interface PresenceEntry {
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
  status: 'online' | 'idle' | 'offline'
}

interface DeviceTokenSummary {
  role: string
  scopes?: string[]
  createdAtMs?: number
  rotatedAtMs?: number
  revokedAtMs?: number
  lastUsedAtMs?: number
}

interface PendingDevice {
  requestId: string
  deviceId: string
  displayName?: string
  role?: string
  remoteIp?: string
  isRepair?: boolean
  ts?: number
}

interface PairedDevice {
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

type Tab = 'instances' | 'devices'

type RawNodeEntry = Record<string, unknown>
type RawPairedDevice = Record<string, unknown>
type RawPendingDevice = Record<string, unknown>

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function numberOrZero(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return 0
}

function normalizeNode(entry: RawNodeEntry): PresenceEntry {
  const connected = entry.connected === true
  const roles = stringArray(entry.roles)
  const caps = stringArray(entry.caps)
  const fallbackRoles =
    roles.length > 0
      ? roles
      : caps.length > 0
        ? caps
        : typeof entry.clientMode === 'string'
          ? [entry.clientMode]
          : []
  const connectedAt = numberOrZero(entry.connectedAt, entry.connectedAtMs, entry.approvedAtMs, entry.createdAtMs)
  const lastActivity = numberOrZero(entry.lastActivity, entry.lastActivityAtMs, entry.lastSeen, entry.lastSeenAtMs)

  return {
    id:
      (typeof entry.id === 'string' && entry.id) ||
      (typeof entry.nodeId === 'string' && entry.nodeId) ||
      (typeof entry.clientId === 'string' && entry.clientId) ||
      (typeof entry.displayName === 'string' && entry.displayName) ||
      'unknown-node',
    clientId: typeof entry.clientId === 'string' ? entry.clientId : '--',
    displayName:
      (typeof entry.displayName === 'string' && entry.displayName) ||
      (typeof entry.nodeId === 'string' && entry.nodeId) ||
      'Unnamed node',
    platform: typeof entry.platform === 'string' ? entry.platform : '--',
    version: typeof entry.version === 'string' ? entry.version : '--',
    roles: fallbackRoles,
    connectedAt,
    lastActivity,
    host: typeof entry.host === 'string' ? entry.host : undefined,
    ip: typeof entry.ip === 'string' ? entry.ip : undefined,
    status: connected ? 'online' : 'offline',
  }
}

function normalizePairedDevice(device: RawPairedDevice): PairedDevice {
  const tokens = Array.isArray(device.tokens)
    ? (device.tokens.filter((token): token is DeviceTokenSummary => typeof token === 'object' && token !== null))
    : []
  const tokenScopes = tokens.flatMap((token) => stringArray(token.scopes))
  const rawScopes = stringArray(device.scopes)
  const scopes = rawScopes.length > 0 ? rawScopes : tokenScopes
  const roles = stringArray(device.roles)
  const fallbackRoles =
    roles.length > 0
      ? roles
      : typeof device.role === 'string'
        ? [device.role]
        : []
  const lastSeen = tokens.reduce<number>((latest, token) => {
    const candidate = typeof token.lastUsedAtMs === 'number' ? token.lastUsedAtMs : 0
    return candidate > latest ? candidate : latest
  }, 0)

  return {
    id:
      (typeof device.id === 'string' && device.id) ||
      (typeof device.deviceId === 'string' && device.deviceId) ||
      'unknown-device',
    deviceId:
      (typeof device.deviceId === 'string' && device.deviceId) ||
      (typeof device.id === 'string' && device.id) ||
      'unknown-device',
    displayName:
      (typeof device.displayName === 'string' && device.displayName) ||
      (typeof device.deviceId === 'string' && device.deviceId) ||
      'Unnamed device',
    publicKey: typeof device.publicKey === 'string' ? device.publicKey : undefined,
    pairedAt: numberOrZero(device.pairedAt, device.approvedAtMs, device.createdAtMs),
    lastSeen,
    trusted: tokens.some((token) => !token.revokedAtMs),
    roles: fallbackRoles,
    scopes,
    tokens,
    createdAtMs: typeof device.createdAtMs === 'number' ? device.createdAtMs : undefined,
    approvedAtMs: typeof device.approvedAtMs === 'number' ? device.approvedAtMs : undefined,
  }
}

function normalizePendingDevice(device: RawPendingDevice): PendingDevice {
  return {
    requestId: typeof device.requestId === 'string' ? device.requestId : '',
    deviceId:
      (typeof device.deviceId === 'string' && device.deviceId) ||
      (typeof device.id === 'string' && device.id) ||
      'unknown-device',
    displayName: typeof device.displayName === 'string' ? device.displayName : undefined,
    role: typeof device.role === 'string' ? device.role : undefined,
    remoteIp: typeof device.remoteIp === 'string' ? device.remoteIp : undefined,
    isRepair: device.isRepair === true,
    ts: typeof device.ts === 'number' ? device.ts : undefined,
  }
}

function relativeTime(ts: number): string {
  if (!ts) return '--'
  const now = Date.now()
  const diffMs = now - (ts < 1e12 ? ts * 1000 : ts)
  if (diffMs < 0) return 'just now'
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function statusColor(status: PresenceEntry['status']): string {
  switch (status) {
    case 'online': return 'bg-green-500/20 text-green-400 border-green-500/30'
    case 'idle': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    case 'offline': return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
    default: return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
  }
}

async function deviceAction(
  action: string,
  params: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string; data?: Record<string, unknown> }> {
  try {
    const res = await fetch('/api/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...params }),
    })
    const data = await res.json()
    if (!res.ok) return { ok: false, error: data.error || `Request failed (${res.status})` }
    return { ok: true, data }
  } catch {
    return { ok: false, error: 'Network error' }
  }
}

export function NodesPanel() {
  const t = useTranslations('nodes')
  const [tab, setTab] = useState<Tab>('instances')
  const [nodes, setNodes] = useState<PresenceEntry[]>([])
  const [devices, setDevices] = useState<PairedDevice[]>([])
  const [pendingDevices, setPendingDevices] = useState<PendingDevice[]>([])
  const [connected, setConnected] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nodesWarning, setNodesWarning] = useState<string | null>(null)
  const [devicesWarning, setDevicesWarning] = useState<string | null>(null)

  const fetchNodes = useCallback(async () => {
    try {
      const res = await fetch('/api/nodes')
      if (!res.ok) { setError('Failed to fetch nodes'); return }
      const data = await res.json()
      const rawNodes = Array.isArray(data.nodes) ? data.nodes : Array.isArray(data.entries) ? data.entries : []
      setNodes(rawNodes.map((entry: RawNodeEntry) => normalizeNode(entry)))
      setConnected(data.connected !== false)
      setNodesWarning(typeof data.warning === 'string' ? data.warning : null)
      setError(null)
    } catch {
      setError('Failed to fetch nodes')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch('/api/nodes?action=devices')
      if (!res.ok) return
      const data = await res.json()
      const rawDevices = Array.isArray(data.paired) ? data.paired : Array.isArray(data.devices) ? data.devices : []
      const rawPending = Array.isArray(data.pending) ? data.pending : []
      setDevices(rawDevices.map((device: RawPairedDevice) => normalizePairedDevice(device)))
      setPendingDevices(rawPending.map((device: RawPendingDevice) => normalizePendingDevice(device)))
      setDevicesWarning(typeof data.warning === 'string' ? data.warning : null)
    } catch {
      // silent fallback
    }
  }, [])

  useEffect(() => {
    fetchNodes()
    fetchDevices()
    const interval = setInterval(() => {
      fetchNodes()
      fetchDevices()
    }, 30000)
    return () => clearInterval(interval)
  }, [fetchNodes, fetchDevices])

  const pendingCount = pendingDevices.length
  const totalDeviceCount = devices.length + pendingCount
  const warningMessages = Array.from(
    new Set([nodesWarning, devicesWarning].filter((message): message is string => Boolean(message))),
  )

  return (
    <div className="m-4">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${
            connected
              ? 'bg-green-500/10 text-green-400 border-green-500/30'
              : 'bg-red-500/10 text-red-400 border-red-500/30'
          }`}
        >
          {connected ? t('gatewayConnected') : t('gatewayUnreachable')}
        </span>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-4">
        <Button
          variant={tab === 'instances' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setTab('instances')}
        >
          {t('tabInstances', { count: nodes.length })}
        </Button>
        <Button
          variant={tab === 'devices' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setTab('devices')}
        >
          {t('tabDevices', { count: totalDeviceCount })}
          {pendingCount > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
              {pendingCount}
            </span>
          )}
        </Button>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}
      {warningMessages.map((warning) => (
        <div
          key={warning}
          className="mb-4 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm"
        >
          {warning}
        </div>
      ))}

      {loading ? (
        <div className="text-muted-foreground text-sm py-8 text-center">{t('loading')}</div>
      ) : tab === 'instances' ? (
        <InstancesTab nodes={nodes} />
      ) : (
        <DevicesTab
          devices={devices}
          pendingDevices={pendingDevices}
          onRefresh={fetchDevices}
        />
      )}
    </div>
  )
}

function InstancesTab({ nodes }: { nodes: PresenceEntry[] }) {
  const t = useTranslations('nodes')
  if (nodes.length === 0) {
    return (
      <div className="text-muted-foreground text-sm py-8 text-center">
        {t('noInstances')}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">{t('colName')}</th>
            <th className="pb-2 pr-4 font-medium">{t('colClientId')}</th>
            <th className="pb-2 pr-4 font-medium">{t('colPlatform')}</th>
            <th className="pb-2 pr-4 font-medium">{t('colVersion')}</th>
            <th className="pb-2 pr-4 font-medium">{t('colRoles')}</th>
            <th className="pb-2 pr-4 font-medium">{t('colStatus')}</th>
            <th className="pb-2 pr-4 font-medium">{t('colConnected')}</th>
            <th className="pb-2 pr-4 font-medium">{t('colLastActivity')}</th>
            <th className="pb-2 font-medium">{t('colHostIp')}</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => (
            <tr key={node.id} className="border-b border-border/50">
              <td className="py-2 pr-4 text-foreground font-medium">{node.displayName}</td>
              <td className="py-2 pr-4 text-muted-foreground font-mono text-xs">
                {node.clientId?.slice(0, 12)}...
              </td>
              <td className="py-2 pr-4 text-muted-foreground">{node.platform}</td>
              <td className="py-2 pr-4 text-muted-foreground">{node.version}</td>
              <td className="py-2 pr-4">
                <div className="flex gap-1 flex-wrap">
                  {(node.roles || []).map((role) => (
                    <span
                      key={role}
                      className="px-1.5 py-0.5 rounded text-xs bg-secondary text-muted-foreground"
                    >
                      {role}
                    </span>
                  ))}
                </div>
              </td>
              <td className="py-2 pr-4">
                <span
                  className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${statusColor(node.status)}`}
                >
                  {node.status}
                </span>
              </td>
              <td className="py-2 pr-4 text-muted-foreground text-xs">
                {relativeTime(node.connectedAt)}
              </td>
              <td className="py-2 pr-4 text-muted-foreground text-xs">
                {relativeTime(node.lastActivity)}
              </td>
              <td className="py-2 text-muted-foreground text-xs font-mono">
                {node.host || node.ip || '--'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DevicesTab({
  devices,
  pendingDevices,
  onRefresh,
}: {
  devices: PairedDevice[]
  pendingDevices: PendingDevice[]
  onRefresh: () => void
}) {
  return (
    <div className="space-y-6">
      {pendingDevices.length > 0 && (
        <PendingDevicesSection devices={pendingDevices} onRefresh={onRefresh} />
      )}
      <PairedDevicesSection devices={devices} onRefresh={onRefresh} />
    </div>
  )
}

function PendingDevicesSection({
  devices,
  onRefresh,
}: {
  devices: PendingDevice[]
  onRefresh: () => void
}) {
  const t = useTranslations('nodes')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleAction(action: 'approve' | 'reject', device: PendingDevice) {
    setActionError(null)
    setActionLoading(`${action}-${device.requestId}`)
    const result = await deviceAction(action, {
      requestId: device.requestId,
      deviceId: device.deviceId,
    })
    setActionLoading(null)
    if (!result.ok) {
      setActionError(result.error || 'Action failed')
    } else {
      onRefresh()
    }
  }

  return (
    <div>
      <h3 className="text-sm font-medium text-amber-400 mb-2">
        {t('pendingPairingRequests', { count: devices.length })}
      </h3>
      {actionError && (
        <div className="mb-2 px-3 py-1.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          {actionError}
        </div>
      )}
      <div className="space-y-2">
        {devices.map((device) => (
          <div
            key={device.requestId}
            className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20"
          >
            <div className="flex items-center gap-3">
              <div>
                <span className="text-sm font-medium text-foreground">
                  {device.displayName || device.deviceId}
                </span>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">{device.deviceId?.slice(0, 16)}</span>
                  {device.role && (
                    <span className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                      {device.role}
                    </span>
                  )}
                  {device.remoteIp && <span>{device.remoteIp}</span>}
                  {device.isRepair && (
                    <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                      repair
                    </span>
                  )}
                  {device.ts && <span>{relativeTime(device.ts)}</span>}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="text-green-400 hover:text-green-300 hover:bg-green-500/10"
                disabled={actionLoading !== null}
                onClick={() => handleAction('approve', device)}
              >
                {actionLoading === `approve-${device.requestId}` ? t('approving') : t('approve')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                disabled={actionLoading !== null}
                onClick={() => handleAction('reject', device)}
              >
                {actionLoading === `reject-${device.requestId}` ? t('rejecting') : t('reject')}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PairedDevicesSection({
  devices,
  onRefresh,
}: {
  devices: PairedDevice[]
  onRefresh: () => void
}) {
  const t = useTranslations('nodes')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null)
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null)

  async function handleRotateToken(deviceId: string, role?: string) {
    setActionError(null)
    setActionLoading(`rotate-${deviceId}`)
    const result = await deviceAction('rotate-token', { deviceId, role })
    setActionLoading(null)
    if (!result.ok) {
      setActionError(result.error || 'Failed to rotate token')
    } else {
      onRefresh()
    }
  }

  async function handleRevokeToken(deviceId: string, role?: string) {
    setActionError(null)
    setActionLoading(`revoke-${deviceId}`)
    const result = await deviceAction('revoke-token', { deviceId, role })
    setActionLoading(null)
    setConfirmRevoke(null)
    if (!result.ok) {
      setActionError(result.error || 'Failed to revoke token')
    } else {
      onRefresh()
    }
  }

  if (devices.length === 0) {
    return (
      <div className="text-muted-foreground text-sm py-8 text-center">
        {t('noPairedDevices')}
      </div>
    )
  }

  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground mb-2">
        {t('pairedDevices', { count: devices.length })}
      </h3>
      {actionError && (
        <div className="mb-2 px-3 py-1.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          {actionError}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">{t('colName')}</th>
              <th className="pb-2 pr-4 font-medium">{t('colDeviceId')}</th>
              <th className="pb-2 pr-4 font-medium">{t('colRoles')}</th>
              <th className="pb-2 pr-4 font-medium">{t('colPaired')}</th>
              <th className="pb-2 pr-4 font-medium">{t('colLastSeen')}</th>
              <th className="pb-2 pr-4 font-medium">{t('colTrust')}</th>
              <th className="pb-2 font-medium">{t('colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((device) => {
              const deviceKey = device.deviceId || device.id
              const isExpanded = expandedDevice === deviceKey
              const tokens = device.tokens || []

              return (
                <tr key={device.id || device.deviceId} className="border-b border-border/50 align-top">
                  <td className="py-2 pr-4 text-foreground font-medium">
                    {device.displayName}
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground font-mono text-xs">
                    {(device.deviceId || device.id)?.slice(0, 12)}...
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex gap-1 flex-wrap">
                      {(device.roles || []).map((role) => (
                        <span
                          key={role}
                          className="px-1.5 py-0.5 rounded text-xs bg-secondary text-muted-foreground"
                        >
                          {role}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground text-xs">
                    {relativeTime(device.pairedAt || device.approvedAtMs || device.createdAtMs || 0)}
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground text-xs">
                    {device.lastSeen ? relativeTime(device.lastSeen) : '--'}
                  </td>
                  <td className="py-2 pr-4">
                    {device.trusted ? (
                      <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium border bg-green-500/20 text-green-400 border-green-500/30">
                        {t('trusted')}
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium border bg-zinc-500/20 text-zinc-400 border-zinc-500/30">
                        {t('untrusted')}
                      </span>
                    )}
                  </td>
                  <td className="py-2">
                    <div className="flex flex-col gap-1">
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          disabled={actionLoading !== null}
                          onClick={() => handleRotateToken(deviceKey)}
                        >
                          {actionLoading === `rotate-${deviceKey}` ? '...' : t('rotateToken')}
                        </Button>
                        {confirmRevoke === deviceKey ? (
                          <div className="flex gap-1 items-center">
                            <span className="text-xs text-red-400">{t('revokeConfirm')}</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-red-400 hover:bg-red-500/10"
                              disabled={actionLoading !== null}
                              onClick={() => handleRevokeToken(deviceKey)}
                            >
                              {actionLoading === `revoke-${deviceKey}` ? '...' : t('yes')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => setConfirmRevoke(null)}
                            >
                              {t('no')}
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-red-400 hover:bg-red-500/10"
                            disabled={actionLoading !== null}
                            onClick={() => setConfirmRevoke(deviceKey)}
                          >
                            {t('revoke')}
                          </Button>
                        )}
                        {tokens.length > 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-muted-foreground"
                            onClick={() => setExpandedDevice(isExpanded ? null : deviceKey)}
                          >
                            {isExpanded ? t('hideTokens') : t('tokens', { count: tokens.length })}
                          </Button>
                        )}
                      </div>
                      {isExpanded && tokens.length > 0 && (
                        <div className="mt-1 space-y-1">
                          {tokens.map((token, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 px-2 py-1 rounded bg-secondary/50 text-xs"
                            >
                              <span className="font-medium text-foreground">{token.role}</span>
                              {token.scopes && token.scopes.length > 0 && (
                                <span className="text-muted-foreground">
                                  [{token.scopes.join(', ')}]
                                </span>
                              )}
                              {token.lastUsedAtMs && (
                                <span className="text-muted-foreground">
                                  {t('tokenUsed', { time: relativeTime(token.lastUsedAtMs) })}
                                </span>
                              )}
                              {token.revokedAtMs && (
                                <span className="text-red-400">{t('revoked')}</span>
                              )}
                              <div className="flex gap-1 ml-auto">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-5 px-1.5 text-[10px]"
                                  disabled={actionLoading !== null}
                                  onClick={() => handleRotateToken(deviceKey, token.role)}
                                >
                                  {t('rotate')}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-5 px-1.5 text-[10px] text-red-400 hover:bg-red-500/10"
                                  disabled={actionLoading !== null || !!token.revokedAtMs}
                                  onClick={() => handleRevokeToken(deviceKey, token.role)}
                                >
                                  {t('revoke')}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
