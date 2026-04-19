'use client'

import { startTransition, useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { useMissionControl } from '@/store'
import { useSmartPoll } from '@/lib/use-smart-poll'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type Timeframe = 'hour' | 'day' | 'week' | 'month'
type TimelineSeriesKey = 'authEvents' | 'injectionAttempts' | 'secretAlerts' | 'toolCalls'

const CANONICAL_TIMEFRAMES: Timeframe[] = ['hour', 'day', 'week', 'month']
const CLIENT_SECURITY_AUDIT_CACHE_MAX_AGE_MS = 30_000

interface AuthEvent {
  type: string
  severity: string
  actor: string
  ip: string
  timestamp: number
  detail: string
}

interface AgentTrust {
  name: string
  score: number
  anomalies: number
}

interface SecretAlert {
  type: string
  severity: string
  actor: string
  preview: string
  detectedAt: number
}

interface ToolAuditEntry {
  tool: string
  calls: number
  successes: number
  failures: number
  lastCalledAt: number | null
}

interface RateLimitSignal {
  ip: string
  hits: number
  lastHit: number
}

interface InjectionAttempt {
  type: string
  severity: string
  source: string
  input: string
  blocked: boolean
  timestamp: number
}

interface TimelinePoint {
  timestamp: number
  authEvents: number
  injectionAttempts: number
  secretAlerts: number
  toolCalls: number
}

interface TimelineSeriesMeta {
  key: TimelineSeriesKey
  colorToken: string
  total: number
}

interface TimelineData {
  timeframe: Timeframe
  bucketSizeSeconds: number
  rangeStart: number
  rangeEnd: number
  points: TimelinePoint[]
  series: TimelineSeriesMeta[]
}

type CheckSeverity = 'critical' | 'high' | 'medium' | 'low'

interface ScanCheck {
  id: string
  name: string
  status: 'pass' | 'fail' | 'warn'
  detail: string
  fix: string
  severity?: CheckSeverity
}

interface ScanCategory {
  score: number
  checks: ScanCheck[]
}

interface ScanData {
  score: number
  overall: string
  categories: Record<string, ScanCategory>
}

interface SecurityAuditData {
  posture: { score: number; level: string }
  scan?: ScanData
  authEvents: {
    loginFailures: number
    tokenRotations: number
    accessDenials: number
    recentEvents: AuthEvent[]
  }
  agentTrust: {
    agents: AgentTrust[]
    flaggedCount: number
  }
  secretExposures: {
    total: number
    recent: SecretAlert[]
  }
  mcpAudit: {
    totalCalls: number
    uniqueTools: number
    failureRate: number
    toolBreakdown: ToolAuditEntry[]
    receiptIntegrity?: unknown
  }
  rateLimits: {
    totalHits: number
    byIp: RateLimitSignal[]
  }
  injectionAttempts: {
    total: number
    recent: InjectionAttempt[]
  }
  timeline: TimelineData
}

interface CachedSecurityAuditData {
  data: SecurityAuditData
  fetchedAt: number
}

const SCAN_STATUS_ICON: Record<string, string> = { pass: '+', fail: 'x', warn: '!' }
const SCAN_STATUS_COLOR: Record<string, string> = { pass: 'text-green-400', fail: 'text-red-400', warn: 'text-amber-400' }

const SEVERITY_BADGE: Record<CheckSeverity, { label: string; className: string }> = {
  critical: { label: 'C', className: 'bg-red-500/20 text-red-400' },
  high: { label: 'H', className: 'bg-orange-500/20 text-orange-400' },
  medium: { label: 'M', className: 'bg-amber-500/20 text-amber-400' },
  low: { label: 'L', className: 'bg-blue-500/20 text-blue-300' },
}

const TIMELINE_SERIES = [
  {
    key: 'authEvents',
    labelKey: 'chartAuthEvents',
    stroke: 'hsl(var(--void-violet))',
    fill: 'hsl(var(--void-violet) / 0.16)',
    panelClass: 'border-violet-500/30 bg-violet-500/5',
    activeClass: 'ring-1 ring-violet-400/60 border-violet-400/50 bg-violet-500/10',
  },
  {
    key: 'injectionAttempts',
    labelKey: 'chartInjections',
    stroke: 'hsl(var(--void-crimson))',
    fill: 'hsl(var(--void-crimson) / 0.16)',
    panelClass: 'border-red-500/30 bg-red-500/5',
    activeClass: 'ring-1 ring-red-400/60 border-red-400/50 bg-red-500/10',
  },
  {
    key: 'secretAlerts',
    labelKey: 'chartSecrets',
    stroke: 'hsl(var(--void-amber))',
    fill: 'hsl(var(--void-amber) / 0.16)',
    panelClass: 'border-amber-500/30 bg-amber-500/5',
    activeClass: 'ring-1 ring-amber-400/60 border-amber-400/50 bg-amber-500/10',
  },
  {
    key: 'toolCalls',
    labelKey: 'chartToolCalls',
    stroke: 'hsl(var(--void-mint))',
    fill: 'hsl(var(--void-mint) / 0.16)',
    panelClass: 'border-emerald-500/30 bg-emerald-500/5',
    activeClass: 'ring-1 ring-emerald-400/60 border-emerald-400/50 bg-emerald-500/10',
  },
] as const satisfies ReadonlyArray<{
  key: TimelineSeriesKey
  labelKey: 'chartAuthEvents' | 'chartInjections' | 'chartSecrets' | 'chartToolCalls'
  stroke: string
  fill: string
  panelClass: string
  activeClass: string
}>

function ScanCategoryRow({ label, icon, category, failingCount }: {
  label: string
  icon: string
  category: ScanCategory
  failingCount: number
}) {
  const t = useTranslations('securityAudit')
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-secondary/50 transition-colors"
      >
        <span className="w-5 h-5 rounded bg-secondary flex items-center justify-center text-xs font-mono text-muted-foreground">
          {icon}
        </span>
        <span className="flex-1 text-sm font-medium">{label}</span>
        <span className={`text-xs tabular-nums ${category.score >= 80 ? 'text-green-400' : category.score >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
          {category.score}%
        </span>
        {failingCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {t('issueCount', { count: failingCount })}
          </span>
        )}
        <span className="text-xs text-muted-foreground/50">{expanded ? '-' : '+'}</span>
      </button>
      {expanded && (
        <div className="border-t border-border/30 px-3 py-2 space-y-1.5 bg-secondary/20">
          {[...category.checks].sort((a, b) => {
            if (a.status === 'pass' && b.status !== 'pass') return 1
            if (a.status !== 'pass' && b.status === 'pass') return -1
            const sev: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
            return (sev[a.severity ?? 'medium'] ?? 2) - (sev[b.severity ?? 'medium'] ?? 2)
          }).map(check => (
            <div key={check.id} className="flex items-start gap-2 py-1">
              <span className={`font-mono text-xs mt-0.5 w-4 shrink-0 ${SCAN_STATUS_COLOR[check.status]}`}>
                [{SCAN_STATUS_ICON[check.status]}]
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{check.name}</span>
                  {check.severity && (
                    <span className={`text-2xs px-1 py-0.5 rounded font-mono leading-none ${SEVERITY_BADGE[check.severity].className}`}>
                      {SEVERITY_BADGE[check.severity].label}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{check.detail}</p>
                {check.fix && check.status !== 'pass' && (
                  <p className="text-xs text-primary/70 mt-0.5">{t('fixPrefix', { fix: check.fix })}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TimelineTooltipContent({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean
  payload?: Array<{ value?: number; name?: string; color?: string }>
  label?: number | string
  formatter: (value: number) => string
}) {
  if (!active || !payload || payload.length === 0) return null
  const timestamp = Number(label ?? 0)
  const rows = payload
    .map((entry) => ({
      name: entry.name || 'Value',
      value: Number(entry.value ?? 0),
      color: entry.color || 'hsl(var(--foreground))',
    }))
    .filter((entry) => entry.value > 0)
  const visibleRows = rows.length > 0 ? rows : payload.map((entry) => ({
    name: entry.name || 'Value',
    value: Number(entry.value ?? 0),
    color: entry.color || 'hsl(var(--foreground))',
  }))

  return (
    <div className="rounded-lg border border-border/70 bg-card/95 px-3 py-2 shadow-xl backdrop-blur-sm">
      <div className="text-xs text-muted-foreground">{formatter(Math.floor(timestamp / 1000))}</div>
      <div className="mt-2 space-y-1.5">
        {visibleRows.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-3 text-xs">
            <span className="font-medium" style={{ color: entry.color }}>
              {entry.name}
            </span>
            <span className="text-foreground">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SecurityAuditPanel() {
  const t = useTranslations('securityAudit')
  const { setSecurityPosture } = useMissionControl()

  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('day')
  const [activeSeries, setActiveSeries] = useState<TimelineSeriesKey | null>(null)
  const [data, setData] = useState<SecurityAuditData | null>(null)
  const [isBlockingLoad, setIsBlockingLoad] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const hasBootstrappedRef = useRef(false)
  const prefetchControllersRef = useRef(new Map<Timeframe, AbortController>())
  const dataCacheRef = useRef(new Map<Timeframe, CachedSecurityAuditData>())

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      for (const controller of prefetchControllersRef.current.values()) {
        controller.abort()
      }
    }
  }, [])

  const cacheAuditData = useCallback((timeframe: Timeframe, audit: SecurityAuditData) => {
    dataCacheRef.current.set(timeframe, {
      data: audit,
      fetchedAt: Date.now(),
    })
  }, [])

  const prefetchTimeframe = useCallback(async (timeframe: Timeframe) => {
    const cached = dataCacheRef.current.get(timeframe)
    if (cached && Date.now() - cached.fetchedAt < CLIENT_SECURITY_AUDIT_CACHE_MAX_AGE_MS) {
      return
    }
    if (prefetchControllersRef.current.has(timeframe)) {
      return
    }

    const controller = new AbortController()
    prefetchControllersRef.current.set(timeframe, controller)

    try {
      const auditRes = await fetch(`/api/security-audit?timeframe=${timeframe}`, { signal: controller.signal })
      if (!auditRes.ok || controller.signal.aborted) return

      const audit = await auditRes.json() as SecurityAuditData
      if (controller.signal.aborted) return

      cacheAuditData(timeframe, audit)
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        return
      }
    } finally {
      const current = prefetchControllersRef.current.get(timeframe)
      if (current === controller) {
        prefetchControllersRef.current.delete(timeframe)
      }
    }
  }, [cacheAuditData])

  const fetchData = useCallback(async () => {
    const requestId = ++requestIdRef.current
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const cachedEntry = dataCacheRef.current.get(selectedTimeframe)
    const cached = cachedEntry?.data

    if (cached) {
      startTransition(() => {
        setData(cached)
        if (cached.posture) {
          setSecurityPosture(cached.posture)
        }
      })
    }

    setIsBlockingLoad(!cached)
    setIsRefreshing(true)
    setLoadError(null)

    try {
      const auditRes = await fetch(`/api/security-audit?timeframe=${selectedTimeframe}`, { signal: controller.signal })
      if (controller.signal.aborted || requestId !== requestIdRef.current) return

      if (!auditRes.ok) {
        setLoadError(`Security audit request failed (${auditRes.status})`)
        if (!cached) {
          setData(null)
        }
        return
      }

      const audit = await auditRes.json() as SecurityAuditData
      cacheAuditData(selectedTimeframe, audit)
      startTransition(() => {
        setData(audit)
        if (audit.posture) {
          setSecurityPosture(audit.posture)
        }
      })
      for (const timeframe of CANONICAL_TIMEFRAMES) {
        if (timeframe !== selectedTimeframe) {
          void prefetchTimeframe(timeframe)
        }
      }
    } catch (error: any) {
      if (error?.name === 'AbortError' || controller.signal.aborted) return
      setLoadError('Security data request failed')
      if (!cached) {
        setData(null)
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsBlockingLoad(false)
        setIsRefreshing(false)
      }
    }
  }, [cacheAuditData, prefetchTimeframe, selectedTimeframe, setSecurityPosture])

  useSmartPoll(fetchData, 30_000)

  useEffect(() => {
    if (!hasBootstrappedRef.current) {
      hasBootstrappedRef.current = true
      return
    }

    void fetchData()
  }, [fetchData])

  const timelinePoints = useMemo(() => (
    data?.timeline.points.map((point) => ({
      ...point,
      timestampMs: point.timestamp * 1000,
    })) ?? []
  ), [data?.timeline.points])

  const activeSeriesDef = activeSeries
    ? TIMELINE_SERIES.find((series) => series.key === activeSeries) ?? null
    : null
  const activeSeriesMeta = activeSeries
    ? data?.timeline.series.find((series) => series.key === activeSeries)
    : null
  const totalTimelineEvents = (data?.timeline.series ?? []).reduce((sum, series) => sum + series.total, 0)
  const hasTimelineActivity = (data?.timeline.series ?? []).some((series) => series.total > 0)
  const displayedTimeframe = data?.timeline.timeframe ?? selectedTimeframe
  const chartIsRefreshing = Boolean(isRefreshing && data && data.timeline.timeframe !== selectedTimeframe)
  const chartRenderKey = `${activeSeries ?? 'all'}:${displayedTimeframe}:${data?.timeline.rangeStart ?? 0}:${data?.timeline.rangeEnd ?? 0}`

  const postureColor = (score: number) => {
    if (score >= 80) return 'text-green-400'
    if (score >= 60) return 'text-yellow-400'
    if (score >= 40) return 'text-orange-400'
    return 'text-red-400'
  }

  const postureRingColor = (score: number) => {
    if (score >= 80) return 'stroke-green-500'
    if (score >= 60) return 'stroke-yellow-500'
    if (score >= 40) return 'stroke-orange-500'
    return 'stroke-red-500'
  }

  const postureBgColor = (level: string) => {
    switch (level) {
      case 'hardened': return 'bg-green-500/15 text-green-400'
      case 'secure': return 'bg-green-500/10 text-green-300'
      case 'needs-attention': return 'bg-yellow-500/15 text-yellow-400'
      case 'at-risk': return 'bg-red-500/15 text-red-400'
      default: return 'bg-muted text-muted-foreground'
    }
  }

  const trustBarColor = (score: number) => {
    if (score >= 0.8) return 'bg-green-500'
    if (score >= 0.5) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const formatTime = (ts: number) => {
    if (!ts || ts <= 0) return '—'
    return new Date(ts * 1000).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatTimelineLabel = (ts: number) => {
    const date = new Date(ts * 1000)
    switch (displayedTimeframe) {
      case 'hour':
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      case 'day':
        return date.toLocaleTimeString([], { hour: '2-digit' })
      case 'week':
      case 'month':
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
      default:
        return formatTime(ts)
    }
  }

  const bucketLabel = useMemo(() => {
    const bucketSize = data?.timeline.bucketSizeSeconds ?? 0
    if (bucketSize === 300) return '5 minute buckets'
    if (bucketSize === 3600) return '1 hour buckets'
    if (bucketSize === 86400) return '1 day buckets'
    return 'Bucketed event counts'
  }, [data?.timeline.bucketSizeSeconds])

  const authEvents = data?.authEvents.recentEvents ?? []
  const agentTrust = data?.agentTrust.agents ?? []
  const secretAlerts = data?.secretExposures.recent ?? []
  const toolAudit = data?.mcpAudit.toolBreakdown ?? []
  const rateLimits = data?.rateLimits.byIp ?? []
  const injectionAttempts = data?.injectionAttempts.recent ?? []

  return (
    <div className="p-6 space-y-6">
      <div className="border-b border-border pb-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
            <p className="text-muted-foreground mt-2">{t('subtitle')}</p>
          </div>
          <div className="flex items-center gap-4">
            {isRefreshing && !isBlockingLoad && (
              <div className="h-2 w-2 rounded-full bg-primary/70 animate-pulse" />
            )}
            {isBlockingLoad && (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
            )}
            <div className="flex flex-wrap justify-end gap-2">
              {(['hour', 'day', 'week', 'month'] as const).map((tf) => (
                <Button
                  key={tf}
                  onClick={() => {
                    if (tf === selectedTimeframe) return
                    startTransition(() => {
                      setSelectedTimeframe(tf)
                    })
                  }}
                  variant={selectedTimeframe === tf ? 'default' : 'secondary'}
                >
                  {t(`timeframe${tf.charAt(0).toUpperCase() + tf.slice(1)}` as 'timeframeHour' | 'timeframeDay' | 'timeframeWeek' | 'timeframeMonth')}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {!data ? (
        isBlockingLoad ? (
          <Loader variant="panel" label={t('loadingSecurityData')} />
        ) : (
          <div className="bg-card border border-border rounded-lg p-6 text-center space-y-3">
            <p className="text-sm text-foreground">Security data failed to load.</p>
            {loadError && <p className="text-xs text-muted-foreground">{loadError}</p>}
            <div>
              <Button onClick={() => { void fetchData() }} variant="secondary">
                Retry
              </Button>
            </div>
          </div>
        )
      ) : (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center gap-6">
              <div className="relative w-24 h-24 flex-shrink-0">
                <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" className="stroke-muted" strokeWidth="2.5" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9"
                    fill="none"
                    className={postureRingColor(data.posture.score)}
                    strokeWidth="2.5"
                    strokeDasharray={`${data.posture.score} ${100 - data.posture.score}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-2xl font-bold ${postureColor(data.posture.score)}`}>
                    {data.posture.score}
                  </span>
                </div>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground">{t('securityPosture')}</h2>
                <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded ${postureBgColor(data.posture.level)}`}>
                  {data.posture.level}
                </span>
                <p className="text-sm text-muted-foreground mt-2">{t('blendedScore')}</p>
              </div>
            </div>
          </div>

          {data.scan && (
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">{t('infrastructureScan')}</h2>
                <span className={`text-sm font-bold tabular-nums ${postureColor(data.scan.score)}`}>
                  {data.scan.score}/100
                </span>
              </div>
              <div className="space-y-2">
                {Object.entries(data.scan.categories).map(([key, cat]) => {
                  const scanCategoryLabels: Record<string, string> = {
                    credentials: t('scanCredentials'),
                    network: t('scanNetwork'),
                    openclaw: t('scanOpenclaw'),
                    runtime: t('scanRuntime'),
                    os: t('scanOs'),
                  }
                  const label = scanCategoryLabels[key] || key
                  const icon = { credentials: 'K', network: 'N', openclaw: 'O', runtime: 'R', os: 'S' }[key] || key[0].toUpperCase()
                  const failing = cat.checks.filter(c => c.status !== 'pass')
                  return (
                    <ScanCategoryRow key={key} label={label} icon={icon} category={cat} failingCount={failing.length} />
                  )
                })}
              </div>
            </div>
          )}

          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-xl font-semibold">{t('securityTimeline', { timeframe: displayedTimeframe })}</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Separate event families stay on separate scales. The focused chart shows discrete counts for one signal at a time.
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <div>{bucketLabel}</div>
                <div>{timelinePoints.length} buckets</div>
              </div>
            </div>

            <div className="relative">
              {chartIsRefreshing && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl border border-border/60 bg-background/72 backdrop-blur-sm">
                  <div className="flex items-center gap-3 rounded-full border border-border/70 bg-card/90 px-4 py-2 shadow-lg">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                    <span className="text-sm text-foreground">{t('loadingSecurityData')}</span>
                  </div>
                </div>
              )}

              <div className={`space-y-4 transition-opacity ${chartIsRefreshing ? 'opacity-35' : 'opacity-100'}`}>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {TIMELINE_SERIES.map((series) => {
                    const total = data.timeline.series.find((item) => item.key === series.key)?.total ?? 0
                    const isSelected = activeSeries === series.key
                    return (
                      <button
                        key={series.key}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setActiveSeries((current) => current === series.key ? null : series.key)}
                        className={`rounded-lg border p-3 text-left transition-smooth ${series.panelClass} ${isSelected ? series.activeClass : 'border-border/60 hover:border-border'}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-foreground">{t(series.labelKey)}</span>
                          <span className="text-lg font-semibold tabular-nums" style={{ color: series.stroke }}>
                            {total}
                          </span>
                        </div>
                        <div className="mt-3 h-16">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={timelinePoints}>
                              <Area
                                type="monotone"
                                dataKey={series.key}
                                stroke={series.stroke}
                                fill={series.fill}
                                strokeWidth={2}
                                isAnimationActive={false}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </button>
                    )
                  })}
                </div>

                <div className="rounded-lg border border-border/60 bg-secondary/20 p-4">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <div>
                      <h3 className="text-sm font-medium text-foreground">
                        {activeSeriesDef ? t(activeSeriesDef.labelKey) : 'All event types'}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {activeSeriesDef
                          ? bucketLabel
                          : 'Click a card to focus a single event type. Click it again to show every event type.'}
                      </p>
                    </div>
                    <div className="text-right">
                      <div
                        className="text-xl font-semibold tabular-nums"
                        style={{ color: activeSeriesDef?.stroke ?? 'hsl(var(--foreground))' }}
                      >
                        {activeSeriesMeta?.total ?? totalTimelineEvents}
                      </div>
                      {!hasTimelineActivity && (
                        <p className="text-xs text-muted-foreground">{t('noTimelineData')}</p>
                      )}
                    </div>
                  </div>
                  <div className="h-72">
                    {activeSeriesDef ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart key={chartRenderKey} data={timelinePoints} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.7)" />
                          <XAxis
                            type="number"
                            dataKey="timestampMs"
                            scale="time"
                            domain={['dataMin', 'dataMax']}
                            tickFormatter={(value) => formatTimelineLabel(Math.floor(Number(value) / 1000))}
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                            minTickGap={24}
                          />
                          <YAxis
                            allowDecimals={false}
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip
                            content={<TimelineTooltipContent formatter={formatTime} />}
                            cursor={{ fill: 'hsl(var(--foreground) / 0.08)' }}
                          />
                          <Bar
                            dataKey={activeSeriesDef.key}
                            name={t(activeSeriesDef.labelKey)}
                            fill={activeSeriesDef.fill}
                            stroke={activeSeriesDef.stroke}
                            strokeWidth={1}
                            radius={[4, 4, 0, 0]}
                            maxBarSize={24}
                            isAnimationActive={false}
                          />
                          {timelinePoints.length > 12 && (
                            <Brush
                              dataKey="timestampMs"
                              height={20}
                              travellerWidth={10}
                              stroke={activeSeriesDef.stroke}
                              fill="hsl(var(--surface-2))"
                              tickFormatter={(value) => formatTimelineLabel(Math.floor(Number(value) / 1000))}
                            />
                          )}
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart key={chartRenderKey} data={timelinePoints} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.7)" />
                          <XAxis
                            type="number"
                            dataKey="timestampMs"
                            scale="time"
                            domain={['dataMin', 'dataMax']}
                            tickFormatter={(value) => formatTimelineLabel(Math.floor(Number(value) / 1000))}
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                            minTickGap={24}
                          />
                          <YAxis
                            allowDecimals={false}
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip
                            content={<TimelineTooltipContent formatter={formatTime} />}
                            cursor={{ stroke: 'hsl(var(--foreground) / 0.18)', strokeWidth: 1 }}
                          />
                          {TIMELINE_SERIES.map((series) => (
                            <Line
                              key={series.key}
                              type="linear"
                              dataKey={series.key}
                              name={t(series.labelKey)}
                              stroke={series.stroke}
                              strokeWidth={2}
                              dot={false}
                              activeDot={{ r: 4, fill: series.stroke, stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                              isAnimationActive={false}
                            />
                          ))}
                          {timelinePoints.length > 12 && (
                            <Brush
                              dataKey="timestampMs"
                              height={20}
                              travellerWidth={10}
                              stroke="hsl(var(--primary))"
                              fill="hsl(var(--surface-2))"
                              tickFormatter={(value) => formatTimelineLabel(Math.floor(Number(value) / 1000))}
                            />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">{t('authEvents')}</h2>
                <div className="text-xs text-muted-foreground">
                  {data.authEvents.loginFailures} / {data.authEvents.tokenRotations} / {data.authEvents.accessDenials}
                </div>
              </div>
              {authEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">{t('noAuthEvents')}</p>
              ) : (
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="text-left text-muted-foreground text-xs">
                        <th className="pb-2 pr-3">{t('colType')}</th>
                        <th className="pb-2 pr-3">{t('colActor')}</th>
                        <th className="pb-2 pr-3">{t('colIP')}</th>
                        <th className="pb-2">{t('colTime')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {authEvents.map((evt, index) => (
                        <tr key={`${evt.type}-${evt.timestamp}-${index}`} className="text-xs">
                          <td className="py-1.5 pr-3">
                            <span className={`px-1.5 py-0.5 rounded text-2xs font-medium ${
                              evt.type.includes('failure') ? 'bg-red-500/15 text-red-400'
                                : evt.type.includes('token') ? 'bg-blue-500/15 text-blue-400'
                                  : 'bg-muted text-muted-foreground'
                            }`}>
                              {evt.type.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-1.5 pr-3 text-foreground">{evt.actor}</td>
                          <td className="py-1.5 pr-3 font-mono text-muted-foreground">{evt.ip || '—'}</td>
                          <td className="py-1.5 text-muted-foreground">{formatTime(evt.timestamp)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">{t('agentTrustScores')}</h2>
                <span className="text-xs text-muted-foreground">{data.agentTrust.flaggedCount} {t('flagged').toLowerCase()}</span>
              </div>
              {agentTrust.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">{t('noAgentTrustData')}</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                  {agentTrust.map((agent) => {
                    const flagged = agent.score < 0.8
                    return (
                      <div
                        key={agent.name}
                        className={`p-3 rounded-lg border ${flagged ? 'border-red-500/50 bg-red-500/5' : 'border-border bg-secondary'}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-foreground truncate">{agent.name}</span>
                          {flagged && (
                            <span className="text-2xs px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 shrink-0 ml-1">{t('flagged')}</span>
                          )}
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${trustBarColor(agent.score)}`}
                            style={{ width: `${agent.score * 100}%` }}
                          />
                        </div>
                        <div className="mt-1 flex items-center justify-between text-2xs text-muted-foreground">
                          <span>{(agent.score * 100).toFixed(0)}%</span>
                          <span>{agent.anomalies} anomalies</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">{t('secretExposureAlerts')}</h2>
              <span className="text-xs text-muted-foreground">{data.secretExposures.total}</span>
            </div>
            {secretAlerts.length === 0 ? (
              <div className="flex items-center gap-2 py-4 justify-center">
                <svg className="w-5 h-5 text-green-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 1a5 5 0 015 5v2a2 2 0 01-2 2H5a2 2 0 01-2-2V6a5 5 0 015-5z" />
                  <path d="M5.5 14h5M6.5 12v2M9.5 12v2" />
                </svg>
                <span className="text-sm font-medium text-green-400">{t('noSecretsDetected')}</span>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-48 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="text-left text-muted-foreground text-xs">
                      <th className="pb-2 pr-3">{t('colType')}</th>
                      <th className="pb-2 pr-3">{t('colSource')}</th>
                      <th className="pb-2 pr-3">{t('colPreview')}</th>
                      <th className="pb-2">{t('colDetected')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {secretAlerts.map((alert, index) => (
                      <tr key={`${alert.type}-${alert.detectedAt}-${index}`} className="text-xs">
                        <td className="py-1.5 pr-3">
                          <span className="px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 text-2xs font-medium">{alert.type}</span>
                        </td>
                        <td className="py-1.5 pr-3 text-foreground">{alert.actor}</td>
                        <td className="py-1.5 pr-3 font-mono text-muted-foreground max-w-72 truncate">{alert.preview}</td>
                        <td className="py-1.5 text-muted-foreground">{formatTime(alert.detectedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">{t('mcpToolAudit')}</h2>
                <div className="text-xs text-muted-foreground">
                  {data.mcpAudit.totalCalls} calls / {data.mcpAudit.uniqueTools} tools
                </div>
              </div>
              {toolAudit.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">{t('noToolUsageData')}</div>
              ) : (
                <div className="space-y-4">
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={toolAudit}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.7)" />
                        <XAxis
                          dataKey="tool"
                          angle={-30}
                          textAnchor="end"
                          height={56}
                          interval={0}
                          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: 12,
                            border: '1px solid hsl(var(--border))',
                            background: 'hsl(var(--card) / 0.95)',
                          }}
                        />
                        <Bar dataKey="successes" stackId="tool-audit" fill="hsl(var(--void-mint))" radius={[4, 4, 0, 0]} name={t('chartSuccess')} isAnimationActive={false} />
                        <Bar dataKey="failures" stackId="tool-audit" fill="hsl(var(--void-crimson))" radius={[4, 4, 0, 0]} name={t('chartFailure')} isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {toolAudit.map((tool) => (
                      <div key={tool.tool} className="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/30 px-3 py-2 text-xs">
                        <div className="min-w-0">
                          <div className="font-medium text-foreground truncate">{tool.tool}</div>
                          <div className="text-muted-foreground">{formatTime(tool.lastCalledAt ?? 0)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-foreground">{tool.calls} calls</div>
                          <div className="text-muted-foreground">{tool.successes} / {tool.failures}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">{t('rateLimitAbuseSignals')}</h2>
                <span className="text-xs text-muted-foreground">{data.rateLimits.totalHits}</span>
              </div>
              {rateLimits.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">{t('noRateLimitSignals')}</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {rateLimits.map((rl) => (
                    <div key={`${rl.ip}-${rl.lastHit}`} className="flex items-center justify-between p-2 bg-secondary rounded-lg text-sm">
                      <span className="font-mono text-foreground">{rl.ip}</span>
                      <div className="text-right">
                        <div className={`text-xs font-medium ${rl.hits > 100 ? 'text-red-400' : rl.hits > 50 ? 'text-yellow-400' : 'text-muted-foreground'}`}>
                          {t('hits', { hits: rl.hits })}
                        </div>
                        <div className="text-2xs text-muted-foreground">{formatTime(rl.lastHit)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">{t('injectionAttempts')}</h2>
              <span className="text-xs text-muted-foreground">{data.injectionAttempts.total}</span>
            </div>
            {injectionAttempts.length === 0 ? (
              <div className="flex items-center gap-2 py-4 justify-center">
                <svg className="w-5 h-5 text-green-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 1l6 3v4c0 3.5-2.5 6.5-6 7.5C4.5 14.5 2 11.5 2 8V4l6-3z" />
                  <path d="M5.5 8l2 2 3.5-3.5" />
                </svg>
                <span className="text-sm font-medium text-green-400">{t('noInjectionAttempts')}</span>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-48 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="text-left text-muted-foreground text-xs">
                      <th className="pb-2 pr-3">{t('colType')}</th>
                      <th className="pb-2 pr-3">{t('colSource')}</th>
                      <th className="pb-2 pr-3">{t('colInput')}</th>
                      <th className="pb-2 pr-3">{t('colStatus')}</th>
                      <th className="pb-2">{t('colTime')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {injectionAttempts.map((attempt, index) => (
                      <tr key={`${attempt.source}-${attempt.timestamp}-${index}`} className="text-xs">
                        <td className="py-1.5 pr-3">
                          <span className="px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 text-2xs font-medium">{attempt.type}</span>
                        </td>
                        <td className="py-1.5 pr-3 text-foreground">{attempt.source}</td>
                        <td className="py-1.5 pr-3 font-mono text-muted-foreground max-w-72 truncate">{attempt.input}</td>
                        <td className="py-1.5 pr-3">
                          <span className={`text-2xs font-medium ${attempt.blocked ? 'text-green-400' : 'text-red-400'}`}>
                            {attempt.blocked ? t('statusBlocked') : t('statusPassed')}
                          </span>
                        </td>
                        <td className="py-1.5 text-muted-foreground">{formatTime(attempt.timestamp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
