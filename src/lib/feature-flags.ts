export type FeatureFlagValue = boolean | number | string | null | undefined

export interface FeatureFlagContext {
  workspaceFlags?: string | Record<string, unknown> | null
  env?: Record<string, string | undefined>
}

const ENV_FORCE_ON_EXCEPTIONS = new Set(['PILOT_PRODUCT_LINE_A_E2E'])

function normalizeBoolean(value: FeatureFlagValue): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (value === 1) return true
    if (value === 0) return false
    return null
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false
  }
  return null
}

function parseWorkspaceFlags(
  workspaceFlags: FeatureFlagContext['workspaceFlags']
): Record<string, FeatureFlagValue> {
  if (!workspaceFlags) return {}
  if (typeof workspaceFlags === 'string') {
    try {
      const parsed: unknown = JSON.parse(workspaceFlags)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, FeatureFlagValue>
        : {}
    } catch {
      return {}
    }
  }
  return workspaceFlags as Record<string, FeatureFlagValue>
}

export function resolveFlag(name: string, ctx: FeatureFlagContext = {}): boolean {
  const env = ctx.env ?? (
    typeof process !== 'undefined'
      ? process.env
      : {}
  )
  const envValue = env[name]
  if (envValue === '0') return false
  if (envValue === '1' && ENV_FORCE_ON_EXCEPTIONS.has(name)) return true

  const flags = parseWorkspaceFlags(ctx.workspaceFlags)
  return normalizeBoolean(flags[name]) ?? false
}
