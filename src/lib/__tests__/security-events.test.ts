import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRun = vi.fn((): any => ({ lastInsertRowid: 1, changes: 1 }))
const mockGet = vi.fn((): any => ({
  auth_failures: 1,
  injection_attempts: 0,
  rate_limit_hits: 0,
  secret_exposures: 0,
  successful_tasks: 5,
  failed_tasks: 0,
  trust_score: 0.95,
}))
const mockPrepare = vi.fn(() => ({ run: mockRun, get: mockGet, all: vi.fn(() => []) }))

vi.mock('@/lib/db', () => ({
  getDatabase: () => ({ prepare: mockPrepare }),
}))

vi.mock('@/lib/event-bus', () => ({
  eventBus: { broadcast: vi.fn() },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { logSecurityEvent, updateAgentTrustScore, getSecurityPosture } from '@/lib/security-events'

describe('logSecurityEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRun.mockReturnValue({ lastInsertRowid: 42, changes: 1 })
  })

  it('inserts an event into the database', () => {
    const id = logSecurityEvent({
      event_type: 'auth_failure',
      severity: 'warning',
      source: 'auth',
      detail: 'test detail',
    })

    expect(mockPrepare).toHaveBeenCalled()
    expect(mockRun).toHaveBeenCalledWith(
      'auth.failure', 'warning', 'auth', null, 'test detail', null, 1, 1
    )
    expect(id).toBe(42)
  })

  it('defaults severity to info when not provided', () => {
    logSecurityEvent({ event_type: 'test_event' })
    expect(mockRun).toHaveBeenCalledWith(
      'test_event', 'info', null, null, null, null, 1, 1
    )
  })

  it('uses provided workspace_id and tenant_id', () => {
    logSecurityEvent({
      event_type: 'test_event',
      severity: 'critical',
      workspace_id: 5,
      tenant_id: 3,
    })
    expect(mockRun).toHaveBeenCalledWith(
      'test_event', 'critical', null, null, null, null, 5, 3
    )
  })

  it('broadcasts via event bus', async () => {
    const { eventBus } = await import('@/lib/event-bus')
    logSecurityEvent({ event_type: 'injection_attempt', severity: 'critical' })
    expect(eventBus.broadcast).toHaveBeenCalledWith(
      'security.event',
      expect.objectContaining({ event_type: 'injection.attempt', severity: 'critical' })
    )
  })
})

describe('updateAgentTrustScore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockReturnValue({
      auth_failures: 1,
      injection_attempts: 0,
      rate_limit_hits: 0,
      secret_exposures: 0,
      successful_tasks: 5,
      failed_tasks: 0,
      trust_score: 0.95,
    })
  })

  it('creates a row if one does not exist (INSERT OR IGNORE)', () => {
    updateAgentTrustScore('test-agent', 'auth.failure', 1)
    // First call: INSERT OR IGNORE, second: UPDATE counter, third: SELECT, fourth: UPDATE score
    expect(mockPrepare).toHaveBeenCalled()
    expect(mockRun).toHaveBeenCalled()
  })

  it('recalculates trust score clamped between 0 and 1', () => {
    mockGet.mockReturnValue({
      auth_failures: 20,
      injection_attempts: 10,
      rate_limit_hits: 5,
      secret_exposures: 3,
      successful_tasks: 0,
      failed_tasks: 0,
      trust_score: 0,
    })

    updateAgentTrustScore('bad-agent', 'injection.attempt', 1)
    // Score would go negative, should be clamped to 0
    const calls = mockRun.mock.calls as any[][]
    const lastCall = calls[calls.length - 1]
    if (typeof lastCall[0] === 'number') {
      expect(lastCall[0]).toBeGreaterThanOrEqual(0)
      expect(lastCall[0]).toBeLessThanOrEqual(1)
    }
  })
})

describe('getSecurityPosture', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns expected posture shape', () => {
    mockGet
      .mockReturnValueOnce({ total: 10, critical: 2, warning: 5 })
      .mockReturnValueOnce({ count: 3 })
      .mockReturnValueOnce({ avg_trust: 0.85 })

    const posture = getSecurityPosture(1)
    expect(posture).toHaveProperty('score')
    expect(posture).toHaveProperty('totalEvents')
    expect(posture).toHaveProperty('criticalEvents')
    expect(posture).toHaveProperty('warningEvents')
    expect(posture).toHaveProperty('avgTrustScore')
    expect(posture).toHaveProperty('recentIncidents')
    expect(typeof posture.score).toBe('number')
    expect(posture.score).toBeGreaterThanOrEqual(0)
    expect(posture.score).toBeLessThanOrEqual(100)
  })

  it('deducts points for critical and warning events', () => {
    mockGet
      .mockReturnValueOnce({ total: 5, critical: 5, warning: 0 })
      .mockReturnValueOnce({ count: 5 })
      .mockReturnValueOnce({ avg_trust: 1.0 })

    const posture = getSecurityPosture(1)
    expect(posture.score).toBeLessThan(100)
  })

  it('returns score of 100 with no events', () => {
    mockGet
      .mockReturnValueOnce({ total: 0, critical: 0, warning: 0 })
      .mockReturnValueOnce({ count: 0 })
      .mockReturnValueOnce({ avg_trust: 1.0 })

    const posture = getSecurityPosture(1)
    expect(posture.score).toBe(100)
  })
})

describe('injection guard new rules', () => {
  let scanForInjection: typeof import('@/lib/injection-guard').scanForInjection

  beforeEach(async () => {
    const mod = await import('@/lib/injection-guard')
    scanForInjection = mod.scanForInjection
  })

  it('detects SSRF targeting metadata endpoint', () => {
    const report = scanForInjection('curl http://169.254.169.254/latest/meta-data/', { context: 'shell' })
    expect(report.safe).toBe(false)
    expect(report.matches.some(m => m.rule === 'cmd-ssrf')).toBe(true)
  })

  it('detects SSRF targeting localhost', () => {
    const report = scanForInjection('wget http://localhost:8080/admin', { context: 'shell' })
    expect(report.safe).toBe(false)
    expect(report.matches.some(m => m.rule === 'cmd-ssrf')).toBe(true)
  })

  it('detects template injection (Jinja2)', () => {
    const report = scanForInjection('{{config.__class__.__init__.__globals__}}', { context: 'prompt' })
    expect(report.safe).toBe(false)
    expect(report.matches.some(m => m.rule === 'cmd-template-injection')).toBe(true)
  })

  it('detects SQL injection (UNION SELECT)', () => {
    const report = scanForInjection("' UNION SELECT * FROM users --", { context: 'shell' })
    expect(report.safe).toBe(false)
    expect(report.matches.some(m => m.rule === 'cmd-sql-injection')).toBe(true)
  })

  it('detects SQL injection (OR 1=1)', () => {
    const report = scanForInjection("' OR 1=1 --", { context: 'shell' })
    expect(report.safe).toBe(false)
    expect(report.matches.some(m => m.rule === 'cmd-sql-injection')).toBe(true)
  })

  it('does not false-positive on normal SQL mentions', () => {
    const report = scanForInjection('SELECT name FROM products WHERE id = 5', { context: 'shell' })
    // This should not trigger because it lacks injection markers
    expect(report.matches.filter(m => m.rule === 'cmd-sql-injection')).toHaveLength(0)
  })
})
