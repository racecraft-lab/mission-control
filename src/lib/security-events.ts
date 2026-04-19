/**
 * Security Events — structured security event logging and agent trust scoring.
 *
 * Persists events to the security_events table and broadcasts via the event bus.
 * Trust scores are recalculated on each security event using weighted factors.
 */

import { getDatabase } from '@/lib/db'
import { eventBus, type EventType } from '@/lib/event-bus'
import { logger } from '@/lib/logger'

export type SecuritySeverity = 'info' | 'warning' | 'critical'

export interface SecurityEvent {
  event_type: string
  severity?: SecuritySeverity
  source?: string
  agent_name?: string
  detail?: string
  ip_address?: string
  workspace_id?: number
  tenant_id?: number
}

export interface SecurityPosture {
  score: number
  totalEvents: number
  criticalEvents: number
  warningEvents: number
  avgTrustScore: number
  recentIncidents: number
}

const TRUST_WEIGHTS: Record<string, { field: string; delta: number }> = {
  'auth.failure': { field: 'auth_failures', delta: -0.05 },
  'injection.attempt': { field: 'injection_attempts', delta: -0.15 },
  'secret.exposure': { field: 'secret_exposures', delta: -0.20 },
  'task.success': { field: 'successful_tasks', delta: 0.02 },
  'task.failure': { field: 'failed_tasks', delta: -0.01 },
}

const POSTURE_WINDOW_SECONDS = 86400
const POSTURE_EVENT_WEIGHTS: Record<string, number> = {
  'secret.exposure': 80,
  'injection.attempt': 70,
  'auth.failure': 15,
  'auth.access_denied': 12,
}

const LEGACY_EVENT_TYPE_ALIASES: Record<string, string> = {
  auth_failure: 'auth.failure',
  auth_token_rotation: 'auth.token_rotation',
  auth_access_denied: 'auth.access_denied',
  injection_attempt: 'injection.attempt',
  rate_limit_hit: 'rate_limit.hit',
  secret_exposure: 'secret.exposure',
}

function normalizeSecurityEventType(eventType: string): string {
  return LEGACY_EVENT_TYPE_ALIASES[eventType] ?? eventType
}

export function calculateAgentTrustScore(row: {
  auth_failures?: number
  injection_attempts?: number
  secret_exposures?: number
  successful_tasks?: number
  failed_tasks?: number
}): number {
  let score = 1.0
  score += (row.auth_failures || 0) * -0.05
  score += (row.injection_attempts || 0) * -0.15
  score += (row.secret_exposures || 0) * -0.20
  score += (row.successful_tasks || 0) * 0.02
  score += (row.failed_tasks || 0) * -0.01
  return Math.max(0, Math.min(1, score))
}

export function logSecurityEvent(event: SecurityEvent): number {
  const db = getDatabase()
  const eventType = normalizeSecurityEventType(event.event_type)
  const severity = event.severity ?? 'info'
  const workspaceId = event.workspace_id ?? 1
  const tenantId = event.tenant_id ?? 1

  const result = db.prepare(`
    INSERT INTO security_events (event_type, severity, source, agent_name, detail, ip_address, workspace_id, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    eventType,
    severity,
    event.source ?? null,
    event.agent_name ?? null,
    event.detail ?? null,
    event.ip_address ?? null,
    workspaceId,
    tenantId,
  )

  const id = result.lastInsertRowid as number

  eventBus.broadcast('security.event' as EventType, {
    id,
    ...event,
    event_type: eventType,
    severity,
    workspace_id: workspaceId,
    timestamp: Math.floor(Date.now() / 1000),
  })

  if (event.agent_name && TRUST_WEIGHTS[eventType]) {
    try {
      updateAgentTrustScore(event.agent_name, eventType, workspaceId)
    } catch (error) {
      logger.warn({ err: error, agentName: event.agent_name, eventType }, 'Failed to update agent trust score')
    }
  }

  return id
}

export function updateAgentTrustScore(
  agentName: string,
  eventType: string,
  workspaceId: number = 1,
): void {
  const db = getDatabase()
  const weight = TRUST_WEIGHTS[eventType]

  // Ensure row exists
  db.prepare(`
    INSERT OR IGNORE INTO agent_trust_scores (agent_name, workspace_id)
    VALUES (?, ?)
  `).run(agentName, workspaceId)

  if (weight) {
    // Increment the counter field
    db.prepare(`
      UPDATE agent_trust_scores
      SET ${weight.field} = ${weight.field} + 1,
          updated_at = unixepoch()
      WHERE agent_name = ? AND workspace_id = ?
    `).run(agentName, workspaceId)

    // Recalculate trust score (clamped 0..1)
    const row = db.prepare(`
      SELECT * FROM agent_trust_scores WHERE agent_name = ? AND workspace_id = ?
    `).get(agentName, workspaceId) as any

    if (row) {
      const score = calculateAgentTrustScore(row)
      const isAnomaly = weight.delta < 0
      db.prepare(`
        UPDATE agent_trust_scores
        SET trust_score = ?,
            last_anomaly_at = CASE WHEN ? THEN unixepoch() ELSE last_anomaly_at END,
            updated_at = unixepoch()
        WHERE agent_name = ? AND workspace_id = ?
      `).run(score, isAnomaly ? 1 : 0, agentName, workspaceId)
    }
  }
}

export function getSecurityPosture(workspaceId: number = 1): SecurityPosture {
  const db = getDatabase()
  const oneDayAgo = Math.floor(Date.now() / 1000) - POSTURE_WINDOW_SECONDS

  const postureEvents = db.prepare(`
    SELECT
      event_type,
      severity,
      COUNT(*) as count
    FROM security_events
    WHERE workspace_id = ? AND created_at > ?
      AND event_type IN ('secret.exposure', 'injection.attempt', 'auth.failure', 'auth.access_denied')
    GROUP BY event_type, severity
  `).all(workspaceId, oneDayAgo) as Array<{ event_type: string; severity: SecuritySeverity; count: number }>

  const trustAvg = db.prepare(`
    SELECT AVG(trust_score) as avg_trust
    FROM agent_trust_scores
    WHERE workspace_id = ?
  `).get(workspaceId) as any

  const avgTrust = trustAvg?.avg_trust ?? 1.0
  const scoredEvents = postureEvents.filter((event) => POSTURE_EVENT_WEIGHTS[event.event_type] != null)
  const criticalCount = scoredEvents
    .filter((event) => event.severity === 'critical')
    .reduce((sum, event) => sum + Number(event.count ?? 0), 0)
  const warningCount = scoredEvents
    .filter((event) => event.severity === 'warning')
    .reduce((sum, event) => sum + Number(event.count ?? 0), 0)
  const recentCount = scoredEvents.reduce((sum, event) => sum + Number(event.count ?? 0), 0)

  // Score the current posture from posture-relevant incidents once per event class.
  // Trust is reported separately so the same incident cannot drag posture down twice.
  let score = 100
  score -= scoredEvents.reduce((sum, event) => (
    sum + (POSTURE_EVENT_WEIGHTS[event.event_type] ?? 0) * Number(event.count ?? 0)
  ), 0)
  score = Math.round(Math.max(0, Math.min(100, score)))

  return {
    score,
    totalEvents: recentCount,
    criticalEvents: criticalCount,
    warningEvents: warningCount,
    avgTrustScore: Math.round(avgTrust * 100) / 100,
    recentIncidents: recentCount,
  }
}
