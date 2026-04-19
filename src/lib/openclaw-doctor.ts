import path from 'node:path'

export type OpenClawDoctorLevel = 'healthy' | 'warning' | 'error'
export type OpenClawDoctorCategory = 'config' | 'state' | 'security' | 'general'

export interface OpenClawDoctorStatus {
  level: OpenClawDoctorLevel
  category: OpenClawDoctorCategory
  healthy: boolean
  summary: string
  issues: string[]
  canFix: boolean
  raw: string
}

function normalizeLine(line: string): string {
  return line
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/^[\s│┃║┆┊╎╏]+/, '')
    .trim()
}

function isSessionAgingLine(line: string): boolean {
  return /^agent:[\w:-]+ \(\d+[mh] ago\)$/i.test(line)
}

function isPositiveOrInstructionalLine(line: string): boolean {
  return /^no .* warnings? detected/i.test(line) ||
    /^no issues/i.test(line) ||
    /^run:\s/i.test(line) ||
    /^all .* (healthy|ok|valid|passed)/i.test(line)
}

function isDecorativeLine(line: string): boolean {
  return /^[▄█▀░\s]+$/.test(line) || /openclaw doctor/i.test(line) || /🦞\s*openclaw\s*🦞/i.test(line)
}

function isStateDirectoryListLine(line: string): boolean {
  return /^(?:\$OPENCLAW_HOME(?:\/\.openclaw)?|~\/\.openclaw|\/\S+)$/.test(line)
}

function getSectionName(line: string): string | null {
  const match = line.match(/^[◇◆?]\s+(.+?)(?:\s+─+.*)?$/)
  return match?.[1]?.trim().toLowerCase() ?? null
}

function isInformationalSection(section: string | null): boolean {
  if (!section) return false

  return [
    'claude cli',
    'other gateway-like services detected',
    'cleanup hints',
    'gateway recommendation',
    'skills status',
    'plugins',
    'plugin compatibility',
    'bootstrap file size',
  ].includes(section)
}

function isSessionLockIssue(line: string): boolean {
  return /stale=yes|stale lock|dead\b|removed stale|failed to remove|unable to remove/i.test(line)
}

function isGatewayAuthIssue(line: string): boolean {
  return !/managed via secretref and is currently unavailable|will not overwrite gateway\.auth\.token|resolve\/rotate the external secret source/i.test(line)
}

function isActionableIssueLine(line: string, section: string | null): boolean {
  if (isSessionAgingLine(line) || isStateDirectoryListLine(line) || isPositiveOrInstructionalLine(line)) {
    return false
  }

  if (isInformationalSection(section)) {
    return false
  }

  if (section === 'session locks') {
    return isSessionLockIssue(line)
  }

  if (section === 'gateway auth') {
    return isGatewayAuthIssue(line)
  }

  return true
}

function normalizeFsPath(candidate: string): string {
  return path.resolve(candidate.trim())
}

function normalizeDisplayedPath(candidate: string, stateDir: string): string {
  const trimmed = candidate.trim()
  if (!trimmed) return trimmed
  if (trimmed === '~/.openclaw') return stateDir
  if (trimmed === '$OPENCLAW_HOME' || trimmed === '$OPENCLAW_HOME/.openclaw') return stateDir
  return trimmed
}

function stripForeignStateDirectoryWarning(rawOutput: string, stateDir?: string): string {
  if (!stateDir) return rawOutput

  const normalizedStateDir = normalizeFsPath(stateDir)
  const lines = rawOutput.split(/\r?\n/)
  const kept: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const normalized = normalizeLine(line)

    if (!/multiple state directories detected/i.test(normalized)) {
      kept.push(line)
      continue
    }

    const blockLines = [line]
    let cursor = index + 1
    while (cursor < lines.length) {
      const nextLine = lines[cursor] ?? ''
      const nextNormalized = normalizeLine(nextLine)
      if (!nextNormalized) {
        blockLines.push(nextLine)
        cursor += 1
        continue
      }
      if (/^(active state dir:|[-*]\s+(?:\/|~\/|\$OPENCLAW_HOME)|\|)/i.test(nextNormalized)) {
        blockLines.push(nextLine)
        cursor += 1
        continue
      }
      break
    }

    const listedDirs = blockLines
      .map(normalizeLine)
      .filter(entry => /^[-*]\s+/.test(entry))
      .map(entry => entry.replace(/^[-*]\s+/, '').trim())
      .filter(Boolean)
      .map(entry => normalizeDisplayedPath(entry, normalizedStateDir))

    const foreignDirs = listedDirs.filter(entry => normalizeFsPath(entry) !== normalizedStateDir)
    const onlyForeignDirs = foreignDirs.length > 0

    if (!onlyForeignDirs) {
      kept.push(...blockLines)
    }

    index = cursor - 1
  }

  return kept.join('\n')
}

function detectCategory(raw: string, issues: string[]): OpenClawDoctorCategory {
  const haystack = `${raw}\n${issues.join('\n')}`.toLowerCase()

  if (/invalid config|config invalid|unrecognized key|invalid option/.test(haystack)) {
    return 'config'
  }

  if (/state integrity|orphan transcript|multiple state directories|session history/.test(haystack)) {
    return 'state'
  }

  if (/security audit|channel security|security /.test(haystack)) {
    return 'security'
  }

  return 'general'
}

export function parseOpenClawDoctorOutput(
  rawOutput: string,
  exitCode = 0,
  options: { stateDir?: string } = {}
): OpenClawDoctorStatus {
  const raw = stripForeignStateDirectoryWarning(rawOutput.trim(), options.stateDir).trim()
  const lines = raw
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean)

  const issues: string[] = []
  let currentSection: string | null = null

  for (const line of lines) {
    const section = getSectionName(line)
    if (section) {
      currentSection = section
      continue
    }

    if (!/^[-*]\s+/.test(line)) {
      continue
    }

    const candidate = line.replace(/^[-*]\s+/, '').trim()
    if (isActionableIssueLine(candidate, currentSection)) {
      issues.push(candidate)
    }
  }

  // Strip positive/negated phrases before checking for warning keywords
  const rawForWarningCheck = raw.replace(/\bno\s+\w+\s+(?:security\s+)?warnings?\s+detected\b/gi, '')
  const mentionsWarnings = /\bwarning|warnings|problem|problems|invalid config\b/i.test(rawForWarningCheck)
  const mentionsHealthy = /\bok\b|\bhealthy\b|\bno issues\b|\bno\b.*\bwarnings?\s+detected\b|\bvalid\b/i.test(raw)

  let level: OpenClawDoctorLevel = 'healthy'
  if (exitCode !== 0 || /invalid config|failed|error/i.test(raw)) {
    level = 'error'
  } else if (issues.length > 0 || mentionsWarnings) {
    level = 'warning'
  } else if (!mentionsHealthy && lines.length > 0) {
    level = 'warning'
  }

  const category = detectCategory(raw, issues)

  const summary =
    level === 'healthy'
      ? 'OpenClaw doctor reports a healthy configuration.'
      : issues[0] ||
        lines.find(line =>
          !/^run:/i.test(line) &&
          !/^file:/i.test(line) &&
          !isSessionAgingLine(line) &&
          !isDecorativeLine(line)
        ) ||
        'OpenClaw doctor reported configuration issues.'

  const canFix = level !== 'healthy' || /openclaw doctor --fix/i.test(raw)

  return {
    level,
    category,
    healthy: level === 'healthy',
    summary,
    issues,
    canFix,
    raw,
  }
}
