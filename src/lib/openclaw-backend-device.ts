import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { config } from "./config"

export type GatewayBackendDeviceIdentity = {
  deviceId: string
  publicKeyPem: string
  privateKeyPem: string
}

export type GatewayBackendDeviceAuthEntry = {
  token: string
  role: string
  scopes: string[]
  updatedAtMs: number
}

type StoredIdentity = {
  version: 1
  deviceId: string
  publicKeyPem: string
  privateKeyPem: string
  createdAtMs: number
}

type DeviceAuthStore = {
  version: 1
  deviceId: string
  tokens: Record<string, GatewayBackendDeviceAuthEntry>
}

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex")

function resolveIdentityPath(): string {
  return path.join(config.dataDir, "openclaw-gateway-backend-device.json")
}

function resolveDeviceAuthPath(): string {
  return path.join(config.dataDir, "openclaw-gateway-backend-auth.json")
}

function ensureDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "")
}

function derivePublicKeyRaw(publicKeyPem: string): Buffer {
  const key = crypto.createPublicKey(publicKeyPem)
  const spki = key.export({ type: "spki", format: "der" }) as Buffer
  if (
    spki.length === ED25519_SPKI_PREFIX.length + 32 &&
    spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
  ) {
    return spki.subarray(ED25519_SPKI_PREFIX.length)
  }
  return spki
}

function fingerprintPublicKey(publicKeyPem: string): string {
  return crypto.createHash("sha256").update(derivePublicKeyRaw(publicKeyPem)).digest("hex")
}

function generateIdentity(): GatewayBackendDeviceIdentity {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519")
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString()
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString()
  return {
    deviceId: fingerprintPublicKey(publicKeyPem),
    publicKeyPem,
    privateKeyPem,
  }
}

function normalizeScopes(scopes: string[] | undefined): string[] {
  if (!Array.isArray(scopes)) return []
  const out = new Set<string>()
  for (const scope of scopes) {
    const trimmed = scope.trim()
    if (trimmed) out.add(trimmed)
  }
  if (out.has("operator.admin")) {
    out.add("operator.read")
    out.add("operator.write")
  } else if (out.has("operator.write")) {
    out.add("operator.read")
  }
  return [...out].toSorted()
}

export function loadOrCreateGatewayBackendIdentity(): GatewayBackendDeviceIdentity {
  const filePath = resolveIdentityPath()
  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as StoredIdentity
      if (
        parsed?.version === 1 &&
        typeof parsed.deviceId === "string" &&
        typeof parsed.publicKeyPem === "string" &&
        typeof parsed.privateKeyPem === "string"
      ) {
        const derivedId = fingerprintPublicKey(parsed.publicKeyPem)
        if (derivedId !== parsed.deviceId) {
          const updated: StoredIdentity = { ...parsed, deviceId: derivedId }
          fs.writeFileSync(filePath, `${JSON.stringify(updated, null, 2)}\n`, { mode: 0o600 })
          try {
            fs.chmodSync(filePath, 0o600)
          } catch {
            // best-effort
          }
          return {
            deviceId: derivedId,
            publicKeyPem: parsed.publicKeyPem,
            privateKeyPem: parsed.privateKeyPem,
          }
        }
        return {
          deviceId: parsed.deviceId,
          publicKeyPem: parsed.publicKeyPem,
          privateKeyPem: parsed.privateKeyPem,
        }
      }
    }
  } catch {
    // regenerate below
  }

  const identity = generateIdentity()
  ensureDir(filePath)
  const stored: StoredIdentity = {
    version: 1,
    deviceId: identity.deviceId,
    publicKeyPem: identity.publicKeyPem,
    privateKeyPem: identity.privateKeyPem,
    createdAtMs: Date.now(),
  }
  fs.writeFileSync(filePath, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 })
  try {
    fs.chmodSync(filePath, 0o600)
  } catch {
    // best-effort
  }
  return identity
}

export function publicKeyRawBase64UrlFromPem(publicKeyPem: string): string {
  return base64UrlEncode(derivePublicKeyRaw(publicKeyPem))
}

export function signGatewayDevicePayload(privateKeyPem: string, payload: string): string {
  const key = crypto.createPrivateKey(privateKeyPem)
  return base64UrlEncode(crypto.sign(null, Buffer.from(payload, "utf8"), key))
}

export function loadGatewayBackendDeviceToken(role: string): GatewayBackendDeviceAuthEntry | null {
  const identity = loadOrCreateGatewayBackendIdentity()
  const filePath = resolveDeviceAuthPath()
  try {
    if (!fs.existsSync(filePath)) return null
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as DeviceAuthStore
    if (!parsed || parsed.version !== 1 || parsed.deviceId !== identity.deviceId) return null
    const entry = parsed.tokens[String(role).trim()]
    if (!entry || typeof entry.token !== "string") return null
    return {
      token: entry.token,
      role: entry.role,
      scopes: normalizeScopes(entry.scopes),
      updatedAtMs: Number(entry.updatedAtMs || 0),
    }
  } catch {
    return null
  }
}

export function storeGatewayBackendDeviceToken(params: {
  role: string
  token: string
  scopes?: string[]
}): GatewayBackendDeviceAuthEntry {
  const identity = loadOrCreateGatewayBackendIdentity()
  const filePath = resolveDeviceAuthPath()
  let existing: DeviceAuthStore | null = null
  try {
    if (fs.existsSync(filePath)) {
      existing = JSON.parse(fs.readFileSync(filePath, "utf8")) as DeviceAuthStore
    }
  } catch {
    existing = null
  }

  const entry: GatewayBackendDeviceAuthEntry = {
    token: params.token,
    role: String(params.role).trim(),
    scopes: normalizeScopes(params.scopes),
    updatedAtMs: Date.now(),
  }
  const next: DeviceAuthStore = {
    version: 1,
    deviceId: identity.deviceId,
    tokens:
      existing && existing.deviceId === identity.deviceId && existing.tokens
        ? { ...existing.tokens, [entry.role]: entry }
        : { [entry.role]: entry },
  }

  ensureDir(filePath)
  fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 })
  try {
    fs.chmodSync(filePath, 0o600)
  } catch {
    // best-effort
  }
  return entry
}

export function clearGatewayBackendDeviceToken(role: string): void {
  const identity = loadOrCreateGatewayBackendIdentity()
  const filePath = resolveDeviceAuthPath()
  try {
    if (!fs.existsSync(filePath)) return
    const existing = JSON.parse(fs.readFileSync(filePath, "utf8")) as DeviceAuthStore
    if (!existing || existing.version !== 1 || existing.deviceId !== identity.deviceId) return
    const trimmedRole = String(role).trim()
    if (!existing.tokens?.[trimmedRole]) return
    const next: DeviceAuthStore = {
      version: 1,
      deviceId: existing.deviceId,
      tokens: { ...existing.tokens },
    }
    delete next.tokens[trimmedRole]
    ensureDir(filePath)
    fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 })
    try {
      fs.chmodSync(filePath, 0o600)
    } catch {
      // best-effort
    }
  } catch {
    // best-effort
  }
}
