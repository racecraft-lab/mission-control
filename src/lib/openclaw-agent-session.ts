export interface OpenClawLinkedAgent {
  name?: string | null
  session_key?: string | null
  config?: string | null
}

function normalizeName(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase()
}

export function normalizeOpenClawId(value: string | null | undefined): string {
  return normalizeName(value).replace(/\s+/g, '-')
}

function parseConfig(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function getAgentOpenClawId(agent: Pick<OpenClawLinkedAgent, 'name' | 'config'>): string | null {
  const parsed = parseConfig(agent.config)
  const configured =
    typeof parsed.openclawId === 'string' && parsed.openclawId.trim()
      ? parsed.openclawId.trim()
      : null
  const fallback = typeof agent.name === 'string' && agent.name.trim() ? agent.name.trim() : null
  const normalized = normalizeOpenClawId(configured || fallback)
  return normalized || null
}

export function buildOpenClawMainSessionKey(agentId: string | null | undefined): string | null {
  const normalized = normalizeOpenClawId(agentId)
  return normalized ? `agent:${normalized}:main` : null
}

export function resolveAgentSessionKey(agent: OpenClawLinkedAgent): string | null {
  const direct = typeof agent.session_key === 'string' ? agent.session_key.trim() : ''
  if (direct) return direct
  return buildOpenClawMainSessionKey(getAgentOpenClawId(agent))
}
