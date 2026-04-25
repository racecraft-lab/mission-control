import { createHash } from 'crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetDatabase } = vi.hoisted(() => ({
  mockGetDatabase: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getDatabase: mockGetDatabase,
}))

vi.mock('@/lib/password', () => ({
  hashPassword: vi.fn(() => 'hashed-password'),
  verifyPassword: vi.fn(() => false),
  verifyPasswordWithRehashCheck: vi.fn(() => ({ valid: false, needsRehash: false })),
}))

vi.mock('@/lib/security-events', () => ({
  logSecurityEvent: vi.fn(),
}))

type SessionQueryRow = {
  id: number
  username: string
  display_name: string
  role: 'admin' | 'operator' | 'viewer'
  provider: 'local' | 'google' | null
  email: string | null
  avatar_url: string | null
  is_approved: number
  workspace_id: number
  tenant_id: number
  created_at: number
  updated_at: number
  last_login_at: number | null
  session_id: number
}

type AgentKeyRow = {
  id: number
  agent_id: number
  workspace_id: number
  scopes: string
  expires_at: number | null
  revoked_at: number | null
}

class FakeAuthDb {
  insertedSessionHash: string | null = null
  sessionLookupHashes: string[] = []
  agentKeyLookupHashes: string[] = []
  sessionRowsByHash = new Map<string, SessionQueryRow>()
  agentRowsByHash = new Map<string, AgentKeyRow>()
  agentsById = new Map<number, { id: number; name: string; workspace_id: number }>()

  prepare(sql: string) {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()

    return {
      get: (...args: unknown[]) => {
        if (normalized.startsWith('select id, tenant_id from workspaces')) {
          return { id: 1, tenant_id: 1 }
        }

        if (normalized.startsWith('select tenant_id from workspaces where id = ?')) {
          return { tenant_id: 1 }
        }

        if (normalized.includes('from user_sessions s') && normalized.includes('where s.token = ? and s.expires_at > ?')) {
          const tokenHash = String(args[0] ?? '')
          this.sessionLookupHashes.push(tokenHash)
          return this.sessionRowsByHash.get(tokenHash)
        }

        if (normalized.includes('from agent_api_keys') && normalized.includes('where key_hash = ?')) {
          const keyHash = String(args[0] ?? '')
          this.agentKeyLookupHashes.push(keyHash)
          return this.agentRowsByHash.get(keyHash)
        }

        if (normalized.startsWith('select id, name from agents where id = ? and workspace_id = ?')) {
          const id = Number(args[0])
          const workspaceId = Number(args[1])
          const agent = this.agentsById.get(id)
          if (!agent || agent.workspace_id !== workspaceId) return undefined
          return { id: agent.id, name: agent.name }
        }

        if (normalized.startsWith("select value from settings where key = 'security.api_key'")) {
          return undefined
        }

        if (normalized.startsWith('select workspace_id from users where id = ?')) {
          return { workspace_id: 1 }
        }

        return undefined
      },
      run: (...args: unknown[]) => {
        if (normalized.startsWith('insert into user_sessions')) {
          this.insertedSessionHash = String(args[0] ?? '')
          return { lastInsertRowid: 1, changes: 1 }
        }

        if (normalized.startsWith('update user_sessions set token = ? where id = ?')) {
          const newHash = String(args[0] ?? '')
          const sessionId = Number(args[1])
          const currentEntry = Array.from(this.sessionRowsByHash.entries()).find(([, row]) => row.session_id === sessionId)
          if (currentEntry) {
            this.sessionRowsByHash.delete(currentEntry[0])
            this.sessionRowsByHash.set(newHash, currentEntry[1])
          }
          return { changes: 1 }
        }

        if (normalized.startsWith('update agent_api_keys set key_hash = ?, updated_at = ? where id = ?')) {
          const newHash = String(args[0] ?? '')
          const keyId = Number(args[2])
          const currentEntry = Array.from(this.agentRowsByHash.entries()).find(([, row]) => row.id === keyId)
          if (currentEntry) {
            this.agentRowsByHash.delete(currentEntry[0])
            this.agentRowsByHash.set(newHash, currentEntry[1])
          }
          return { changes: 1 }
        }

        return { changes: 1, lastInsertRowid: 1 }
      },
    }
  }
}

describe('auth hash migration', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    mockGetDatabase.mockReset()
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      AUTH_SECRET: 'test-auth-secret',
      API_KEY: '',
      NEXT_PHASE: 'phase-test',
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('writes session tokens with HMAC-SHA256 instead of legacy SHA-256', async () => {
    const db = new FakeAuthDb()
    mockGetDatabase.mockReturnValue(db)

    const { createSession } = await import('@/lib/auth')
    const { token } = createSession(42, undefined, undefined, 1)

    const legacyHash = createHash('sha256').update(token).digest('hex')
    expect(db.insertedSessionHash).toBeTruthy()
    expect(db.insertedSessionHash).not.toBe(legacyHash)
  })

  it('falls back to legacy session hash and upgrades it to HMAC', async () => {
    const db = new FakeAuthDb()
    const token = 'legacy-session-token'
    const legacyHash = createHash('sha256').update(token).digest('hex')

    db.sessionRowsByHash.set(legacyHash, {
      id: 7,
      username: 'alice',
      display_name: 'Alice',
      role: 'admin',
      provider: 'local',
      email: null,
      avatar_url: null,
      is_approved: 1,
      workspace_id: 1,
      tenant_id: 1,
      created_at: 1,
      updated_at: 1,
      last_login_at: 1,
      session_id: 99,
    })

    mockGetDatabase.mockReturnValue(db)
    const { hashApiKey, validateSession } = await import('@/lib/auth')
    const user = validateSession(token)

    expect(user?.username).toBe('alice')
    expect(db.sessionLookupHashes).toHaveLength(2)
    expect(db.sessionLookupHashes[0]).not.toBe(legacyHash)
    expect(db.sessionLookupHashes[1]).toBe(legacyHash)

    const hmacSessionHash = db.sessionLookupHashes[0]
    expect(db.sessionRowsByHash.has(hmacSessionHash)).toBe(true)
    expect(db.sessionRowsByHash.has(legacyHash)).toBe(false)

    db.sessionLookupHashes = []
    const userAfterUpgrade = validateSession(token)
    expect(userAfterUpgrade?.username).toBe('alice')
    expect(db.sessionLookupHashes).toEqual([hmacSessionHash])

    const legacyApiHash = createHash('sha256').update('api-key').digest('hex')
    expect(hashApiKey('api-key')).not.toBe(legacyApiHash)
  })

  it('falls back to legacy API-key hash and upgrades it to HMAC', async () => {
    const db = new FakeAuthDb()
    const rawApiKey = 'mca_legacy_key'
    const legacyHash = createHash('sha256').update(rawApiKey).digest('hex')

    db.agentRowsByHash.set(legacyHash, {
      id: 5,
      agent_id: 77,
      workspace_id: 1,
      scopes: JSON.stringify(['operator']),
      expires_at: null,
      revoked_at: null,
    })
    db.agentsById.set(77, { id: 77, name: 'Aegis', workspace_id: 1 })

    mockGetDatabase.mockReturnValue(db)
    const { getUserFromRequest } = await import('@/lib/auth')
    const request = new Request('http://localhost/api/test', {
      headers: new Headers({ 'x-api-key': rawApiKey }),
    })

    const user = getUserFromRequest(request)
    expect(user?.username).toBe('agent:Aegis')
    expect(db.agentKeyLookupHashes).toHaveLength(2)
    expect(db.agentKeyLookupHashes[0]).not.toBe(legacyHash)
    expect(db.agentKeyLookupHashes[1]).toBe(legacyHash)

    const hmacKeyHash = db.agentKeyLookupHashes[0]
    expect(db.agentRowsByHash.has(hmacKeyHash)).toBe(true)
    expect(db.agentRowsByHash.has(legacyHash)).toBe(false)

    db.agentKeyLookupHashes = []
    const userAfterUpgrade = getUserFromRequest(request)
    expect(userAfterUpgrade?.username).toBe('agent:Aegis')
    expect(db.agentKeyLookupHashes).toEqual([hmacKeyHash])
  })

  it('fails fast when AUTH_SECRET is missing in production at first hash use', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      AUTH_SECRET: '',
      API_KEY: '',
    }

    // Module load is deferred — auth.ts no longer derives the pepper at import
    // time so that `next build` can statically collect route handlers without
    // a real AUTH_SECRET. The fail-fast moves to the first call site that
    // actually needs the pepper (hashApiKey / session token hashing).
    const { hashApiKey } = await import('@/lib/auth')
    expect(() => hashApiKey('test-key')).toThrow(
      'AUTH_SECRET must be configured in production for token hashing',
    )
  })
})
