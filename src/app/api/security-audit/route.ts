import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { readLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { getSecurityPosture } from '@/lib/security-events'
import { verifyMcpCallReceipts } from '@/lib/mcp-audit'
import { runSecurityScan } from '@/lib/security-scan'

type Timeframe = 'hour' | 'day' | 'week' | 'month'
type TimelineSeriesKey = 'authEvents' | 'injectionAttempts' | 'secretAlerts' | 'toolCalls'
type SecurityAuditQuery = {
  workspaceId: number
  timeframe: Timeframe
  eventTypeFilter: string | null
  severityFilter: string | null
  agentFilter: string | null
}

const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  hour: 3600,
  day: 86400,
  week: 7 * 86400,
  month: 30 * 86400,
}

const TIMELINE_BUCKET_SECONDS: Record<Timeframe, number> = {
  hour: 300,
  day: 3600,
  week: 86400,
  month: 86400,
}

const TIMELINE_SERIES: Array<{ key: TimelineSeriesKey; colorToken: string }> = [
  { key: 'authEvents', colorToken: '--void-violet' },
  { key: 'injectionAttempts', colorToken: '--void-crimson' },
  { key: 'secretAlerts', colorToken: '--void-amber' },
  { key: 'toolCalls', colorToken: '--void-mint' },
]

const CANONICAL_TIMEFRAMES: Timeframe[] = ['hour', 'day', 'week', 'month']
const SECURITY_AUDIT_CACHE_TTL_MS = 45_000
const SECURITY_SCAN_CACHE_TTL_MS = 30_000
const SECURITY_AUDIT_PREWARM_DEDUPE_MS = 10_000

type SecurityAuditCacheEntry = {
  expiresAt: number
  freshness: string
  payload: unknown
}

type SecurityAuditPrewarmEntry = {
  startedAt: number
  promise: Promise<void>
}

const securityAuditCache = new Map<string, SecurityAuditCacheEntry>()
const securityAuditPrewarmState = new Map<string, SecurityAuditPrewarmEntry>()
let securityScanCache: { expiresAt: number; value: ReturnType<typeof runSecurityScan> } | null = null

function asTimeframe(value: string | null): Timeframe {
  if (value === 'hour' || value === 'day' || value === 'week' || value === 'month') {
    return value
  }
  return 'day'
}

function toCount(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0)
}

function getSecurityAuditCacheKey(params: SecurityAuditQuery): string {
  return JSON.stringify(params)
}

function getSecurityAuditFreshness(db: ReturnType<typeof getDatabase>, workspaceId: number): string {
  const securityMax = toCount((db.prepare(`
    SELECT MAX(created_at) as max_created_at
    FROM security_events
    WHERE workspace_id = ?
  `).get(workspaceId) as any)?.max_created_at)
  const mcpMax = toCount((db.prepare(`
    SELECT MAX(created_at) as max_created_at
    FROM mcp_call_log
    WHERE workspace_id = ?
  `).get(workspaceId) as any)?.max_created_at)

  return `${securityMax}:${mcpMax}`
}

function readSecurityAuditCache(key: string, freshness: string): unknown | null {
  const cached = securityAuditCache.get(key)
  if (!cached) return null
  if (cached.expiresAt <= Date.now() || cached.freshness !== freshness) {
    securityAuditCache.delete(key)
    return null
  }
  return cached.payload
}

function writeSecurityAuditCache(key: string, freshness: string, payload: unknown) {
  const expiresAt = Date.now() + SECURITY_AUDIT_CACHE_TTL_MS
  securityAuditCache.set(key, { expiresAt, freshness, payload })

  for (const [entryKey, entry] of securityAuditCache.entries()) {
    if (entry.expiresAt <= Date.now()) {
      securityAuditCache.delete(entryKey)
    }
  }
}

function getCachedSecurityScan() {
  if (securityScanCache && securityScanCache.expiresAt > Date.now()) {
    return securityScanCache.value
  }

  const value = runSecurityScan()
  securityScanCache = {
    value,
    expiresAt: Date.now() + SECURITY_SCAN_CACHE_TTL_MS,
  }
  return value
}

function getTimeframeBounds(timeframe: Timeframe, now = Math.floor(Date.now() / 1000)) {
  const seconds = TIMEFRAME_SECONDS[timeframe]
  const bucketSize = TIMELINE_BUCKET_SECONDS[timeframe]
  const since = now - seconds
  const firstBucket = Math.floor(since / bucketSize) * bucketSize
  const lastBucket = Math.floor(now / bucketSize) * bucketSize

  return {
    now,
    since,
    bucketSize,
    firstBucket,
    lastBucket,
  }
}

function isCanonicalSecurityAuditQuery(query: SecurityAuditQuery) {
  return !query.eventTypeFilter && !query.severityFilter && !query.agentFilter
}

function buildSecurityAuditPayload(
  db: ReturnType<typeof getDatabase>,
  query: SecurityAuditQuery,
) {
  const { workspaceId, timeframe, eventTypeFilter, severityFilter, agentFilter } = query
  const { since, bucketSize, firstBucket, lastBucket } = getTimeframeBounds(timeframe)

  const scan = getCachedSecurityScan()
  const eventPosture = getSecurityPosture(workspaceId)

  const blendedScore = Math.round(scan.score * 0.7 + eventPosture.score * 0.3)
  const level = blendedScore >= 90 ? 'hardened'
    : blendedScore >= 70 ? 'secure'
    : blendedScore >= 40 ? 'needs-attention'
    : 'at-risk'

  const authEventsQuery = db.prepare(`
    SELECT event_type, severity, agent_name, detail, ip_address, created_at
    FROM security_events
    WHERE workspace_id = ? AND created_at > ?
      AND event_type IN ('auth.failure', 'auth.token_rotation', 'auth.access_denied')
    ORDER BY created_at DESC
    LIMIT 50
  `).all(workspaceId, since) as any[]

  const loginFailures = authEventsQuery.filter((e) => e.event_type === 'auth.failure').length
  const tokenRotations = authEventsQuery.filter((e) => e.event_type === 'auth.token_rotation').length
  const accessDenials = authEventsQuery.filter((e) => e.event_type === 'auth.access_denied').length

  const agents = db.prepare(`
    SELECT agent_name, trust_score, last_anomaly_at,
      auth_failures + injection_attempts + secret_exposures as anomalies
    FROM agent_trust_scores
    WHERE workspace_id = ?
    ORDER BY trust_score ASC
  `).all(workspaceId) as any[]

  const flaggedCount = agents.filter((a: any) => a.trust_score < 0.8).length

  const secretEvents = db.prepare(`
    SELECT event_type, severity, agent_name, detail, created_at
    FROM security_events
    WHERE workspace_id = ? AND created_at > ? AND event_type = 'secret.exposure'
    ORDER BY created_at DESC
    LIMIT 20
  `).all(workspaceId, since) as any[]

  const mcpTotals = db.prepare(`
    SELECT
      COUNT(*) as total_calls,
      COUNT(DISTINCT tool_name) as unique_tools,
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failures
    FROM mcp_call_log
    WHERE workspace_id = ? AND created_at > ?
  `).get(workspaceId, since) as any

  const toolBreakdown = db.prepare(`
    SELECT
      tool_name,
      COUNT(*) as calls,
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failures,
      MAX(created_at) as last_called_at
    FROM mcp_call_log
    WHERE workspace_id = ? AND created_at > ?
    GROUP BY tool_name
    ORDER BY calls DESC, tool_name ASC
    LIMIT 10
  `).all(workspaceId, since) as any[]

  const totalCalls = toCount(mcpTotals?.total_calls)
  const failureRate = totalCalls > 0
    ? Math.round((toCount(mcpTotals?.failures) / totalCalls) * 10000) / 100
    : 0

  const rateLimitEvents = db.prepare(`
    SELECT COUNT(*) as total
    FROM security_events
    WHERE workspace_id = ? AND created_at > ? AND event_type = 'rate_limit.hit'
  `).get(workspaceId, since) as any

  const rateLimitByIp = db.prepare(`
    SELECT ip_address, COUNT(*) as count, MAX(created_at) as last_hit
    FROM security_events
    WHERE workspace_id = ? AND created_at > ? AND event_type = 'rate_limit.hit' AND ip_address IS NOT NULL
    GROUP BY ip_address
    ORDER BY count DESC, last_hit DESC
    LIMIT 10
  `).all(workspaceId, since) as any[]

  const injectionEvents = db.prepare(`
    SELECT event_type, severity, agent_name, detail, ip_address, created_at
    FROM security_events
    WHERE workspace_id = ? AND created_at > ? AND event_type = 'injection.attempt'
    ORDER BY created_at DESC
    LIMIT 20
  `).all(workspaceId, since) as any[]

  let timelineQuery = `
    SELECT
      (created_at / ${bucketSize}) * ${bucketSize} as bucket,
      SUM(CASE WHEN event_type IN ('auth.failure', 'auth.token_rotation', 'auth.access_denied') THEN 1 ELSE 0 END) as auth_events,
      SUM(CASE WHEN event_type = 'injection.attempt' THEN 1 ELSE 0 END) as injection_attempts,
      SUM(CASE WHEN event_type = 'secret.exposure' THEN 1 ELSE 0 END) as secret_alerts
    FROM security_events
    WHERE workspace_id = ? AND created_at > ?
  `
  const timelineParams: any[] = [workspaceId, since]

  if (eventTypeFilter) {
    timelineQuery += ' AND event_type = ?'
    timelineParams.push(eventTypeFilter)
  }
  if (severityFilter) {
    timelineQuery += ' AND severity = ?'
    timelineParams.push(severityFilter)
  }
  if (agentFilter) {
    timelineQuery += ' AND agent_name = ?'
    timelineParams.push(agentFilter)
  }

  timelineQuery += ' GROUP BY bucket ORDER BY bucket ASC'

  const securityTimeline = db.prepare(timelineQuery).all(...timelineParams) as any[]
  const includeToolCalls = !eventTypeFilter && !severityFilter
  const mcpTimelineParams: any[] = [workspaceId, since]
  let mcpTimeline: any[] = []

  if (includeToolCalls) {
    let mcpTimelineQuery = `
      SELECT
        (created_at / ${bucketSize}) * ${bucketSize} as bucket,
        COUNT(*) as tool_calls
      FROM mcp_call_log
      WHERE workspace_id = ? AND created_at > ?
    `

    if (agentFilter) {
      mcpTimelineQuery += ' AND agent_name = ?'
      mcpTimelineParams.push(agentFilter)
    }

    mcpTimelineQuery += ' GROUP BY bucket ORDER BY bucket ASC'
    mcpTimeline = db.prepare(mcpTimelineQuery).all(...mcpTimelineParams) as any[]
  }

  const securityTimelineByBucket = new Map(
    securityTimeline.map((row: any) => [toCount(row.bucket), row]),
  )
  const mcpTimelineByBucket = new Map(
    mcpTimeline.map((row: any) => [toCount(row.bucket), row]),
  )

  const timelinePoints: Array<{
    timestamp: number
    authEvents: number
    injectionAttempts: number
    secretAlerts: number
    toolCalls: number
  }> = []
  for (let bucket = firstBucket; bucket <= lastBucket; bucket += bucketSize) {
    const securityRow = securityTimelineByBucket.get(bucket)
    const mcpRow = mcpTimelineByBucket.get(bucket)
    timelinePoints.push({
      timestamp: bucket,
      authEvents: toCount(securityRow?.auth_events),
      injectionAttempts: toCount(securityRow?.injection_attempts),
      secretAlerts: toCount(securityRow?.secret_alerts),
      toolCalls: toCount(mcpRow?.tool_calls),
    })
  }

  const timelineSeries = TIMELINE_SERIES.map((series) => ({
    key: series.key,
    colorToken: series.colorToken,
    total: timelinePoints.reduce((sum, point) => sum + toCount(point[series.key]), 0),
  }))

  return {
    posture: { score: blendedScore, level },
    scan: {
      score: scan.score,
      overall: scan.overall,
      categories: scan.categories,
    },
    authEvents: {
      loginFailures,
      tokenRotations,
      accessDenials,
      recentEvents: authEventsQuery.slice(0, 10).map((event) => ({
        type: String(event.event_type || '').replace('auth.', ''),
        severity: event.severity || 'info',
        actor: event.agent_name || 'system',
        ip: event.ip_address || '',
        timestamp: toCount(event.created_at),
        detail: event.detail || '',
      })),
    },
    agentTrust: {
      agents: agents.map((agent: any) => ({
        name: agent.agent_name,
        score: Number(agent.trust_score ?? 0),
        anomalies: toCount(agent.anomalies),
      })),
      flaggedCount,
    },
    secretExposures: {
      total: secretEvents.length,
      recent: secretEvents.slice(0, 5).map((event) => ({
        type: String(event.event_type || '').replace('secret.', ''),
        severity: event.severity || 'warning',
        actor: event.agent_name || 'unknown',
        preview: event.detail || '',
        detectedAt: toCount(event.created_at),
      })),
    },
    mcpAudit: {
      totalCalls,
      uniqueTools: toCount(mcpTotals?.unique_tools),
      failureRate,
      toolBreakdown: toolBreakdown.map((tool) => ({
        tool: tool.tool_name,
        calls: toCount(tool.calls),
        successes: toCount(tool.successes),
        failures: toCount(tool.failures),
        lastCalledAt: tool.last_called_at ? toCount(tool.last_called_at) : null,
      })),
      receiptIntegrity: (() => {
        try {
          return verifyMcpCallReceipts(24, workspaceId)
        } catch {
          return null
        }
      })(),
    },
    rateLimits: {
      totalHits: toCount(rateLimitEvents?.total),
      byIp: rateLimitByIp.map((row: any) => ({
        ip: row.ip_address,
        hits: toCount(row.count),
        lastHit: toCount(row.last_hit),
      })),
    },
    injectionAttempts: {
      total: injectionEvents.length,
      recent: injectionEvents.slice(0, 5).map((event) => ({
        type: String(event.event_type || '').replace('injection.', ''),
        severity: event.severity || 'warning',
        source: event.agent_name || event.ip_address || 'unknown',
        input: event.detail || '',
        blocked: true,
        timestamp: toCount(event.created_at),
      })),
    },
    timeline: {
      timeframe,
      bucketSizeSeconds: bucketSize,
      rangeStart: firstBucket,
      rangeEnd: lastBucket,
      points: timelinePoints,
      series: timelineSeries,
    },
  }
}

function getOrBuildSecurityAuditPayload(
  db: ReturnType<typeof getDatabase>,
  query: SecurityAuditQuery,
  freshness: string,
) {
  const cacheKey = getSecurityAuditCacheKey(query)
  const cachedResponse = readSecurityAuditCache(cacheKey, freshness)

  if (cachedResponse) {
    return { cacheKey, payload: cachedResponse, fromCache: true }
  }

  const payload = buildSecurityAuditPayload(db, query)
  writeSecurityAuditCache(cacheKey, freshness, payload)
  return { cacheKey, payload, fromCache: false }
}

function prewarmCanonicalSecurityAuditCaches(
  db: ReturnType<typeof getDatabase>,
  workspaceId: number,
  freshness: string,
  currentTimeframe: Timeframe,
) {
  const prewarmKey = `${workspaceId}:${freshness}`
  const now = Date.now()
  const existing = securityAuditPrewarmState.get(prewarmKey)

  if (existing && now - existing.startedAt < SECURITY_AUDIT_PREWARM_DEDUPE_MS) {
    return
  }

  const promise = Promise.resolve().then(() => {
    for (const timeframe of CANONICAL_TIMEFRAMES) {
      const query: SecurityAuditQuery = {
        workspaceId,
        timeframe,
        eventTypeFilter: null,
        severityFilter: null,
        agentFilter: null,
      }
      const cacheKey = getSecurityAuditCacheKey(query)
      if (timeframe !== currentTimeframe && readSecurityAuditCache(cacheKey, freshness)) {
        continue
      }
      if (timeframe === currentTimeframe && readSecurityAuditCache(cacheKey, freshness)) {
        continue
      }
      const payload = buildSecurityAuditPayload(db, query)
      writeSecurityAuditCache(cacheKey, freshness, payload)
    }
  }).catch((error) => {
    logger.warn({ err: error, workspaceId }, 'Failed to prewarm security audit cache')
  }).finally(() => {
    const latest = securityAuditPrewarmState.get(prewarmKey)
    if (latest?.promise === promise) {
      securityAuditPrewarmState.delete(prewarmKey)
    }
  })

  securityAuditPrewarmState.set(prewarmKey, {
    startedAt: now,
    promise,
  })
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = readLimiter(request)
  if (rateCheck) return rateCheck

  try {
    const { searchParams } = new URL(request.url)
    const timeframe = asTimeframe(searchParams.get('timeframe'))
    const eventTypeFilter = searchParams.get('event_type')
    const severityFilter = searchParams.get('severity')
    const agentFilter = searchParams.get('agent')
    const workspaceId = auth.user.workspace_id ?? 1

    const db = getDatabase()
    const freshness = getSecurityAuditFreshness(db, workspaceId)
    const query: SecurityAuditQuery = {
      workspaceId,
      timeframe,
      eventTypeFilter,
      severityFilter,
      agentFilter,
    }
    const { payload, fromCache } = getOrBuildSecurityAuditPayload(db, query, freshness)

    if (isCanonicalSecurityAuditQuery(query)) {
      void prewarmCanonicalSecurityAuditCaches(db, workspaceId, freshness, fromCache ? timeframe : timeframe)
    }

    return NextResponse.json(payload)
  } catch (error) {
    logger.error({ err: error }, 'GET /api/security-audit error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
