import {
  loadFallbackDevices,
  loadFallbackNodes,
} from '@/lib/openclaw-node-fallback'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { config } from '@/lib/config'
import { logger } from '@/lib/logger'
import { callOpenClawGateway } from '@/lib/openclaw-gateway'

const GATEWAY_TIMEOUT = 5000

function unwrapGatewayPayload<T>(data: T): T | unknown {
  return data && typeof data === 'object' && 'payload' in (data as Record<string, unknown>)
    ? (data as Record<string, unknown>).payload
    : data
}

/** Probe the gateway HTTP /health endpoint to check reachability. */
async function isGatewayReachable(): Promise<boolean> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT)
  try {
    const res = await fetch(
      `http://${config.gatewayHost}:${config.gatewayPort}/health`,
      { signal: controller.signal },
    )
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

function describeGatewayFailure(prefix: string, err: unknown): string {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : ''
  if (!message) return prefix
  const compact = message.replace(/\s+/g, ' ').trim()
  return `${prefix} ${compact}`
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const action = request.nextUrl.searchParams.get('action') || 'list'

  if (action === 'list') {
    try {
      const connected = await isGatewayReachable()
      const fallbackNodes = await loadFallbackNodes(config.openclawStateDir, { gatewayReachable: connected })
      if (!connected) {
        return NextResponse.json({
          nodes: fallbackNodes,
          connected: false,
          degraded: fallbackNodes.length > 0,
          warning: fallbackNodes.length > 0
            ? 'Gateway unreachable. Showing last known node data from the OpenClaw state directory.'
            : undefined,
        })
      }

      try {
        const data = await callOpenClawGateway<{ nodes?: unknown[] }>('node.list', {}, GATEWAY_TIMEOUT)
        const payload = unwrapGatewayPayload(data) as { nodes?: unknown[]; entries?: unknown[] } | undefined
        return NextResponse.json({
          nodes: payload?.nodes ?? payload?.entries ?? [],
          connected: true,
        })
      } catch (rpcErr) {
        logger.warn({ err: rpcErr }, 'node.list RPC failed, using fallback node data')
        return NextResponse.json({
          nodes: fallbackNodes,
          connected: true,
          degraded: fallbackNodes.length > 0,
          warning: describeGatewayFailure(
            'Live gateway node listing failed. Showing fallback node data from the OpenClaw state directory.',
            rpcErr,
          ),
        })
      }
    } catch (err) {
      logger.warn({ err }, 'Gateway unreachable for node listing')
      const fallbackNodes = await loadFallbackNodes(config.openclawStateDir)
      return NextResponse.json({
        nodes: fallbackNodes,
        connected: false,
        degraded: fallbackNodes.length > 0,
        warning: fallbackNodes.length > 0
          ? describeGatewayFailure(
              'Gateway reachability check failed. Showing last known node data from the OpenClaw state directory.',
              err,
            )
          : undefined,
      })
    }
  }

  if (action === 'devices') {
    const fallbackDevices = loadFallbackDevices(config.openclawStateDir)
    try {
      const connected = await isGatewayReachable()
      if (!connected) {
        return NextResponse.json({
          devices: fallbackDevices.devices,
          pending: fallbackDevices.pending,
          degraded: fallbackDevices.devices.length > 0 || fallbackDevices.pending.length > 0,
          warning: fallbackDevices.devices.length > 0 || fallbackDevices.pending.length > 0
            ? 'Gateway unreachable. Showing last known device data from the OpenClaw state directory.'
            : undefined,
        })
      }

      try {
        const data = await callOpenClawGateway<{ devices?: unknown[] }>(
          'device.pair.list',
          {},
          GATEWAY_TIMEOUT,
        )
        const payload = unwrapGatewayPayload(data) as
          | { devices?: unknown[]; paired?: unknown[]; pending?: unknown[] }
          | undefined
        return NextResponse.json({
          devices: payload?.devices ?? [],
          paired: payload?.paired ?? [],
          pending: payload?.pending ?? [],
        })
      } catch (rpcErr) {
        logger.warn({ err: rpcErr }, 'device.pair.list RPC failed, using fallback device data')
        return NextResponse.json({
          devices: fallbackDevices.devices,
          pending: fallbackDevices.pending,
          degraded: fallbackDevices.devices.length > 0 || fallbackDevices.pending.length > 0,
          warning: describeGatewayFailure(
            'Live gateway device listing failed. Showing fallback device data from the OpenClaw state directory.',
            rpcErr,
          ),
        })
      }
    } catch (err) {
      logger.warn({ err }, 'Gateway unreachable for device listing')
      return NextResponse.json({
        devices: fallbackDevices.devices,
        pending: fallbackDevices.pending,
        degraded: fallbackDevices.devices.length > 0 || fallbackDevices.pending.length > 0,
        warning: fallbackDevices.devices.length > 0 || fallbackDevices.pending.length > 0
          ? describeGatewayFailure(
              'Gateway reachability check failed. Showing last known device data from the OpenClaw state directory.',
              err,
            )
          : undefined,
      })
    }
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
}

const VALID_DEVICE_ACTIONS = ['approve', 'reject', 'rotate-token', 'revoke-token'] as const
type DeviceAction = (typeof VALID_DEVICE_ACTIONS)[number]

/** Map UI action names to gateway RPC method names and their required param keys. */
const ACTION_RPC_MAP: Record<DeviceAction, { method: string; paramKey: 'requestId' | 'deviceId' }> = {
  'approve':      { method: 'device.pair.approve', paramKey: 'requestId' },
  'reject':       { method: 'device.pair.reject',  paramKey: 'requestId' },
  'rotate-token': { method: 'device.token.rotate',  paramKey: 'deviceId' },
  'revoke-token': { method: 'device.token.revoke',  paramKey: 'deviceId' },
}

/**
 * POST /api/nodes - Device management actions
 * Body: { action: DeviceAction, requestId?: string, deviceId?: string, role?: string, scopes?: string[] }
 */
export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const action = body.action as string
  if (!action || !VALID_DEVICE_ACTIONS.includes(action as DeviceAction)) {
    return NextResponse.json(
      { error: `Invalid action. Must be one of: ${VALID_DEVICE_ACTIONS.join(', ')}` },
      { status: 400 },
    )
  }

  const spec = ACTION_RPC_MAP[action as DeviceAction]

  // Validate required param
  const id = body[spec.paramKey] as string | undefined
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: `Missing required field: ${spec.paramKey}` }, { status: 400 })
  }

  // Build RPC params
  const params: Record<string, unknown> = { [spec.paramKey]: id }
  if ((action === 'rotate-token' || action === 'revoke-token') && body.role) {
    params.role = body.role
  }
  if (action === 'rotate-token' && Array.isArray(body.scopes)) {
    params.scopes = body.scopes
  }

  try {
    const result = await callOpenClawGateway(spec.method, params, GATEWAY_TIMEOUT)
    return NextResponse.json(result)
  } catch (err: unknown) {
    logger.error({ err }, 'Gateway device action failed')
    return NextResponse.json({ error: 'Gateway device action failed' }, { status: 502 })
  }
}
