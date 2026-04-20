import { WebSocket } from "ws"
import { runOpenClaw } from "./command"
import { config } from "./config"
import { getDetectedGatewayToken } from "./gateway-runtime"
import {
  clearGatewayBackendDeviceToken,
  loadGatewayBackendDeviceToken,
  loadOrCreateGatewayBackendIdentity,
  publicKeyRawBase64UrlFromPem,
  signGatewayDevicePayload,
  storeGatewayBackendDeviceToken,
} from "./openclaw-backend-device"
import { logger } from "./logger"
import { APP_VERSION } from "./version"

type GatewayFrame = {
  type?: "event" | "req" | "res"
  event?: string
  method?: string
  id?: string
  ok?: boolean
  result?: unknown
  error?: { message?: string } | string | null
  payload?: unknown
}

const PROTOCOL_VERSION = 3
const DEFAULT_GATEWAY_CLIENT_ID = process.env.MISSION_CONTROL_GATEWAY_CLIENT_ID || "gateway-client"
const DEFAULT_GATEWAY_ROLE = "operator"
const DEFAULT_GATEWAY_SCOPES = [
  "operator.admin",
  "operator.read",
  "operator.write",
  "operator.approvals",
  "operator.pairing",
]
const WS_CONNECTING = 0
const WS_OPEN = 1

export function parseGatewayJsonOutput(raw: string): unknown | null {
  const trimmed = String(raw || "").trim()
  if (!trimmed) return null

  const objectStart = trimmed.indexOf("{")
  const arrayStart = trimmed.indexOf("[")
  const hasObject = objectStart >= 0
  const hasArray = arrayStart >= 0

  let start = -1
  let end = -1

  if (hasObject && hasArray) {
    if (objectStart < arrayStart) {
      start = objectStart
      end = trimmed.lastIndexOf("}")
    } else {
      start = arrayStart
      end = trimmed.lastIndexOf("]")
    }
  } else if (hasObject) {
    start = objectStart
    end = trimmed.lastIndexOf("}")
  } else if (hasArray) {
    start = arrayStart
    end = trimmed.lastIndexOf("]")
  }

  if (start < 0 || end < start) return null

  try {
    return JSON.parse(trimmed.slice(start, end + 1))
  } catch {
    return null
  }
}

function formatGatewayError(error: unknown, fallback: string): Error {
  if (error instanceof Error && error.message) return error
  if (typeof error === "string" && error.trim()) return new Error(error.trim())
  return new Error(fallback)
}

function formatGatewayFrameError(frame: GatewayFrame, fallback: string): Error {
  const err = frame.error
  if (err && typeof err === "object" && typeof err.message === "string" && err.message.trim()) {
    return new Error(err.message.trim())
  }
  if (typeof err === "string" && err.trim()) return new Error(err.trim())
  return new Error(fallback)
}

function buildGatewayWebSocketUrl(): string {
  const host = String(config.gatewayHost || "127.0.0.1").trim() || "127.0.0.1"
  const port = Math.max(1, Number(config.gatewayPort || 18789) || 18789)
  return `ws://${host}:${port}`
}

export function unwrapGatewayResponsePayload<T = unknown>(value: unknown): T {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    if ("payload" in record) return record.payload as T
    if ("result" in record) {
      const result = record.result
      if (result && typeof result === "object" && "payload" in (result as Record<string, unknown>)) {
        return (result as Record<string, unknown>).payload as T
      }
      return result as T
    }
  }
  return value as T
}

function buildDeviceAuthPayload(params: {
  deviceId: string
  clientId: string
  clientMode: string
  role: string
  scopes: string[]
  signedAtMs: number
  token?: string | null
  nonce: string
}): string {
  const scopes = params.scopes.join(",")
  const token = params.token ?? ""
  return [
    "v2",
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token,
    params.nonce,
  ].join("|")
}

export async function callOpenClawGatewayViaWebSocket<T = unknown>(
  method: string,
  params: unknown,
  timeoutMs = 10000,
): Promise<T> {
  const wsUrl = buildGatewayWebSocketUrl()
  const sharedAuthToken = getDetectedGatewayToken()
  const backendIdentity = loadOrCreateGatewayBackendIdentity()
  const storedDeviceAuth = loadGatewayBackendDeviceToken(DEFAULT_GATEWAY_ROLE)

  return await new Promise<T>((resolve, reject) => {
    const socket = new WebSocket(wsUrl)
    const connectRequestId = `mc-connect-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const rpcRequestId = `mc-rpc-${Date.now()}-${Math.random().toString(16).slice(2)}`
    let settled = false
    let handshakeComplete = false

    const finishReject = (error: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.removeAllListeners()
      if (socket.readyState === WS_CONNECTING || socket.readyState === WS_OPEN) {
        socket.close()
      }
      reject(error)
    }

    const finishResolve = (value: T) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.removeAllListeners()
      if (socket.readyState === WS_CONNECTING || socket.readyState === WS_OPEN) {
        socket.close()
      }
      resolve(value)
    }

    const timer = setTimeout(() => {
      finishReject(new Error(`Gateway WS RPC timed out for ${method} after ${timeoutMs}ms`))
    }, timeoutMs)

    socket.on("message", (raw) => {
      const serialized = typeof raw === "string" ? raw : raw.toString()
      let frame: GatewayFrame
      try {
        frame = JSON.parse(serialized) as GatewayFrame
      } catch {
        return
      }

      if (frame.type === "event" && frame.event === "connect.challenge") {
        const eventPayload =
          frame.payload && typeof frame.payload === "object"
            ? (frame.payload as Record<string, unknown>)
            : null
        const nonce = typeof eventPayload?.nonce === "string" ? eventPayload.nonce : ""
        const signedAtMs = Date.now()
        const signatureToken = storedDeviceAuth?.token ?? sharedAuthToken ?? null
        const publicKey = publicKeyRawBase64UrlFromPem(backendIdentity.publicKeyPem)
        const devicePayload = buildDeviceAuthPayload({
          deviceId: backendIdentity.deviceId,
          clientId: DEFAULT_GATEWAY_CLIENT_ID,
          clientMode: "backend",
          role: DEFAULT_GATEWAY_ROLE,
          scopes: DEFAULT_GATEWAY_SCOPES,
          signedAtMs,
          token: signatureToken,
          nonce,
        })
        socket.send(
          JSON.stringify({
            type: "req",
            method: "connect",
            id: connectRequestId,
            params: {
              minProtocol: PROTOCOL_VERSION,
              maxProtocol: PROTOCOL_VERSION,
              client: {
                id: DEFAULT_GATEWAY_CLIENT_ID,
                displayName: "Mission Control",
                version: APP_VERSION,
                platform: "node",
                mode: "backend",
                instanceId: `mc-api-${process.pid}`,
              },
              role: DEFAULT_GATEWAY_ROLE,
              scopes: DEFAULT_GATEWAY_SCOPES,
              caps: ["tool-events"],
              auth: storedDeviceAuth?.token
                ? { deviceToken: storedDeviceAuth.token }
                : sharedAuthToken
                  ? { token: sharedAuthToken }
                  : undefined,
              device: {
                id: backendIdentity.deviceId,
                publicKey,
                signature: signGatewayDevicePayload(backendIdentity.privateKeyPem, devicePayload),
                signedAt: signedAtMs,
                nonce,
              },
            },
          }),
        )
        return
      }

      if (frame.type !== "res") return

      if (frame.id === connectRequestId) {
        if (!frame.ok) {
          const connectError = formatGatewayFrameError(frame, "Gateway connect handshake failed")
          if (
            storedDeviceAuth?.token &&
            /device token/i.test(connectError.message) &&
            /(mismatch|invalid|expired|revoked|unknown)/i.test(connectError.message)
          ) {
            clearGatewayBackendDeviceToken(DEFAULT_GATEWAY_ROLE)
          }
          finishReject(connectError)
          return
        }
        const connectResult = unwrapGatewayResponsePayload<{ deviceToken?: unknown } | undefined>(frame)
        if (typeof connectResult?.deviceToken === "string" && connectResult.deviceToken.trim()) {
          storeGatewayBackendDeviceToken({
            role: DEFAULT_GATEWAY_ROLE,
            token: connectResult.deviceToken,
            scopes: DEFAULT_GATEWAY_SCOPES,
          })
        }
        handshakeComplete = true
        socket.send(
          JSON.stringify({
            type: "req",
            method,
            id: rpcRequestId,
            params: params ?? {},
          }),
        )
        return
      }

      if (frame.id === rpcRequestId) {
        if (!frame.ok) {
          finishReject(formatGatewayFrameError(frame, `Gateway RPC ${method} failed`))
          return
        }
        finishResolve(unwrapGatewayResponsePayload<T>(frame))
      }
    })

    socket.on("error", (error) => {
      finishReject(formatGatewayError(error, `Gateway WS RPC failed for ${method}`))
    })

    socket.on("close", (code, reason) => {
      if (settled) return
      const reasonText = typeof reason === "string" ? reason : reason?.toString?.() || ""
      const message = handshakeComplete
        ? `Gateway WS RPC closed before responding to ${method} (${code}${reasonText ? `: ${reasonText}` : ""})`
        : `Gateway WS handshake closed before completing (${code}${reasonText ? `: ${reasonText}` : ""})`
      finishReject(new Error(message))
    })
  })
}

export async function callOpenClawGateway<T = unknown>(
  method: string,
  params: unknown,
  timeoutMs = 10000,
): Promise<T> {
  let wsError: Error | null = null

  try {
    return await callOpenClawGatewayViaWebSocket<T>(method, params, timeoutMs)
  } catch (error) {
    wsError = formatGatewayError(error, `Gateway WS RPC failed for ${method}`)
    logger.warn({ err: wsError, method }, "Gateway WS RPC failed, falling back to openclaw CLI")
  }

  try {
    const result = await runOpenClaw(
      [
        "gateway",
        "call",
        method,
        "--timeout",
        String(Math.max(1000, Math.floor(timeoutMs))),
        "--params",
        JSON.stringify(params ?? {}),
        "--json",
      ],
      { timeoutMs: timeoutMs + 2000 },
    )

    const payload = parseGatewayJsonOutput(result.stdout)
    if (payload == null) {
      throw new Error(`Invalid JSON response from gateway method ${method}`)
    }

    return unwrapGatewayResponsePayload<T>(payload)
  } catch (error) {
    const cliError = formatGatewayError(error, `Gateway CLI RPC failed for ${method}`)
    if (wsError) {
      throw new Error(`${wsError.message}; CLI fallback failed: ${cliError.message}`)
    }
    throw cliError
  }
}
