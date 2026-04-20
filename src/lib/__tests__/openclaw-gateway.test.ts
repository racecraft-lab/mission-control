import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const runOpenClawMock = vi.fn()
  const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }
  const loadGatewayBackendDeviceTokenMock = vi.fn()
  const loadOrCreateGatewayBackendIdentityMock = vi.fn(() => ({
    deviceId: "backend-device-id",
    publicKeyPem: "public-key-pem",
    privateKeyPem: "private-key-pem",
  }))
  const publicKeyRawBase64UrlFromPemMock = vi.fn(() => "public-key-raw")
  const signGatewayDevicePayloadMock = vi.fn(() => "signed-payload")
  const storeGatewayBackendDeviceTokenMock = vi.fn()
  const clearGatewayBackendDeviceTokenMock = vi.fn()
  let wsScenario: "success" | "error" = "success"
  let lastConstructorArgs: unknown[] = []
  const sentFrames: Array<{ id: string; method: string; params?: unknown }> = []

  class MockWebSocket {
    handlers = new Map<string, Set<(...args: any[]) => void>>()
    readyState = 0

    constructor(...args: unknown[]) {
      lastConstructorArgs = args
      queueMicrotask(() => {
        this.readyState = 1
        this.emit("open")
        if (wsScenario === "success") {
          this.emit(
            "message",
            JSON.stringify({ type: "event", event: "connect.challenge", payload: { nonce: "nonce-1" } }),
          )
        } else {
          this.emit("error", new Error("ws broken"))
        }
      })
    }

    on(event: string, handler: (...args: any[]) => void) {
      const current = this.handlers.get(event) ?? new Set()
      current.add(handler)
      this.handlers.set(event, current)
      return this
    }

    off(event: string, handler: (...args: any[]) => void) {
      this.handlers.get(event)?.delete(handler)
      return this
    }

    removeListener(event: string, handler: (...args: any[]) => void) {
      return this.off(event, handler)
    }

    once(event: string, handler: (...args: any[]) => void) {
      const wrapped = (...args: any[]) => {
        this.off(event, wrapped)
        handler(...args)
      }
      return this.on(event, wrapped)
    }

    removeAllListeners() {
      this.handlers.clear()
      return this
    }

    send(raw: string) {
      const frame = JSON.parse(raw) as { id: string; method: string; params?: unknown }
      sentFrames.push(frame)
      if (frame.method === "connect") {
        queueMicrotask(() => {
          this.emit(
            "message",
            JSON.stringify({ type: "res", id: frame.id, ok: true, payload: { deviceToken: "issued-device-token" } }),
          )
        })
        return
      }

      queueMicrotask(() => {
        this.emit(
          "message",
          JSON.stringify({
            type: "res",
            id: frame.id,
            ok: true,
            payload: { ok: true, method: frame.method, params: frame.params ?? {} },
          }),
        )
      })
    }

    close(code = 1000, reason = "") {
      this.readyState = 3
      queueMicrotask(() => {
        this.emit("close", code, Buffer.from(String(reason)))
      })
    }

    private emit(event: string, ...args: any[]) {
      for (const handler of [...(this.handlers.get(event) ?? [])]) {
        handler(...args)
      }
    }
  }

  return {
    runOpenClawMock,
    logger,
    loadGatewayBackendDeviceTokenMock,
    loadOrCreateGatewayBackendIdentityMock,
    publicKeyRawBase64UrlFromPemMock,
    signGatewayDevicePayloadMock,
    storeGatewayBackendDeviceTokenMock,
    clearGatewayBackendDeviceTokenMock,
    setWsScenario(value: "success" | "error") {
      wsScenario = value
    },
    getLastConstructorArgs() {
      return lastConstructorArgs
    },
    getSentFrames() {
      return sentFrames
    },
    MockWebSocket,
  }
})

vi.mock("ws", () => ({ WebSocket: mocks.MockWebSocket }))
vi.mock("@/lib/command", () => ({ runOpenClaw: mocks.runOpenClawMock }))
vi.mock("@/lib/config", () => ({
  config: { gatewayHost: "127.0.0.1", gatewayPort: 18789, openclawStateDir: "/tmp", openclawBin: "openclaw" },
}))
vi.mock("@/lib/gateway-runtime", () => ({ getDetectedGatewayToken: () => "gateway-token" }))
vi.mock("@/lib/openclaw-backend-device", () => ({
  loadGatewayBackendDeviceToken: mocks.loadGatewayBackendDeviceTokenMock,
  loadOrCreateGatewayBackendIdentity: mocks.loadOrCreateGatewayBackendIdentityMock,
  publicKeyRawBase64UrlFromPem: mocks.publicKeyRawBase64UrlFromPemMock,
  signGatewayDevicePayload: mocks.signGatewayDevicePayloadMock,
  storeGatewayBackendDeviceToken: mocks.storeGatewayBackendDeviceTokenMock,
  clearGatewayBackendDeviceToken: mocks.clearGatewayBackendDeviceTokenMock,
}))
vi.mock("@/lib/logger", () => ({ logger: mocks.logger }))
vi.mock("@/lib/version", () => ({ APP_VERSION: "1.0.0-test" }))

import { callOpenClawGateway, parseGatewayJsonOutput, unwrapGatewayResponsePayload } from "@/lib/openclaw-gateway"

describe("parseGatewayJsonOutput", () => {
  it("parses embedded object payloads", () => {
    expect(parseGatewayJsonOutput('warn\n{"status":"started","runId":"abc"}\n')).toEqual({
      status: "started",
      runId: "abc",
    })
  })

  it("parses embedded array payloads", () => {
    expect(parseGatewayJsonOutput('note\n[{"id":1},{"id":2}]')).toEqual([{ id: 1 }, { id: 2 }])
  })

  it("returns null for non-json output", () => {
    expect(parseGatewayJsonOutput("plain text only")).toBeNull()
  })
})

describe("unwrapGatewayResponsePayload", () => {
  it("prefers top-level payload from gateway frames", () => {
    expect(unwrapGatewayResponsePayload({ payload: { nodes: [{ id: "hal" }] } })).toEqual({
      nodes: [{ id: "hal" }],
    })
  })

  it("supports legacy result.payload responses", () => {
    expect(unwrapGatewayResponsePayload({ result: { payload: { paired: [{ id: "dev-1" }] } } })).toEqual({
      paired: [{ id: "dev-1" }],
    })
  })

  it("falls back to result when payload is absent", () => {
    expect(unwrapGatewayResponsePayload({ result: { ok: true } })).toEqual({ ok: true })
  })
})

describe("callOpenClawGateway", () => {
  beforeEach(() => {
    mocks.setWsScenario("success")
    mocks.runOpenClawMock.mockReset()
    mocks.logger.warn.mockReset()
    mocks.loadGatewayBackendDeviceTokenMock.mockReset()
    mocks.loadGatewayBackendDeviceTokenMock.mockReturnValue(null)
    mocks.loadOrCreateGatewayBackendIdentityMock.mockClear()
    mocks.publicKeyRawBase64UrlFromPemMock.mockClear()
    mocks.signGatewayDevicePayloadMock.mockClear()
    mocks.storeGatewayBackendDeviceTokenMock.mockReset()
    mocks.clearGatewayBackendDeviceTokenMock.mockReset()
    vi.unstubAllEnvs()
    mocks.getSentFrames().length = 0
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("prefers direct Gateway WS RPC over the CLI", async () => {
    const result = await callOpenClawGateway<{ ok: boolean; method: string; params: unknown }>(
      "node.list",
      { limit: 10 },
      1000,
    )

    expect(result).toEqual({ ok: true, method: "node.list", params: { limit: 10 } })
    expect(mocks.runOpenClawMock).not.toHaveBeenCalled()
    expect(mocks.getLastConstructorArgs()).toEqual(["ws://127.0.0.1:18789"])
    expect(mocks.getSentFrames()[0]).toMatchObject({
      method: "connect",
      params: {
        client: {
          id: "gateway-client",
          mode: "backend",
          displayName: "Mission Control",
        },
        scopes: [
          "operator.admin",
          "operator.read",
          "operator.write",
          "operator.approvals",
          "operator.pairing",
        ],
        auth: {
          token: "gateway-token",
        },
        device: {
          id: "backend-device-id",
          publicKey: "public-key-raw",
          signature: "signed-payload",
          nonce: "nonce-1",
        },
      },
    })
    expect(mocks.storeGatewayBackendDeviceTokenMock).toHaveBeenCalledWith({
      role: "operator",
      token: "issued-device-token",
      scopes: [
        "operator.admin",
        "operator.read",
        "operator.write",
        "operator.approvals",
        "operator.pairing",
      ],
    })
  })

  it("falls back to the CLI when the Gateway WS RPC path fails", async () => {
    mocks.setWsScenario("error")
    mocks.runOpenClawMock.mockResolvedValue({
      stdout: '{"devices":[{"id":"dev-1"}]}\n',
      stderr: "",
      code: 0,
    })

    const result = await callOpenClawGateway<{ devices: Array<{ id: string }> }>(
      "device.pair.list",
      {},
      1000,
    )

    expect(result).toEqual({ devices: [{ id: "dev-1" }] })
    expect(mocks.runOpenClawMock).toHaveBeenCalledTimes(1)
    expect(mocks.logger.warn).toHaveBeenCalledTimes(1)
  })

  it("unwraps top-level payloads from the CLI fallback", async () => {
    mocks.setWsScenario("error")
    mocks.runOpenClawMock.mockResolvedValue({
      stdout: '{"payload":{"paired":[{"id":"dev-2"}],"pending":[]}}\n',
      stderr: "",
      code: 0,
    })

    const result = await callOpenClawGateway<{ paired: Array<{ id: string }>; pending: unknown[] }>(
      "device.pair.list",
      {},
      1000,
    )

    expect(result).toEqual({ paired: [{ id: "dev-2" }], pending: [] })
  })

  it("prefers a stored backend device token when present", async () => {
    mocks.loadGatewayBackendDeviceTokenMock.mockReturnValue({
      token: "stored-device-token",
      role: "operator",
      scopes: ["operator.admin", "operator.read"],
      updatedAtMs: 123,
    })

    await callOpenClawGateway<{ ok: boolean }>("node.list", {}, 1000)

    expect(mocks.getSentFrames()[0]).toMatchObject({
      method: "connect",
      params: {
        auth: {
          deviceToken: "stored-device-token",
        },
      },
    })
  })
})
