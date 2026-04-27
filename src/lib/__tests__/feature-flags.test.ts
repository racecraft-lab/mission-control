import { describe, expect, it } from 'vitest'
import { resolveFlag } from '@/lib/feature-flags'

describe('resolveFlag', () => {
  it('defaults FEATURE flags off when workspace flags are absent', () => {
    expect(resolveFlag('FEATURE_WORKSPACE_SWITCHER', { env: {} })).toBe(false)
  })

  it('honors workspace JSON opt-in', () => {
    expect(resolveFlag('FEATURE_WORKSPACE_SWITCHER', {
      env: {},
      workspaceFlags: { FEATURE_WORKSPACE_SWITCHER: true },
    })).toBe(true)
  })

  it('lets env 0 force a workspace flag off', () => {
    expect(resolveFlag('FEATURE_WORKSPACE_SWITCHER', {
      env: { FEATURE_WORKSPACE_SWITCHER: '0' },
      workspaceFlags: { FEATURE_WORKSPACE_SWITCHER: true },
    })).toBe(false)
  })

  it('does not let env 1 force normal FEATURE flags on', () => {
    expect(resolveFlag('FEATURE_WORKSPACE_SWITCHER', {
      env: { FEATURE_WORKSPACE_SWITCHER: '1' },
      workspaceFlags: null,
    })).toBe(false)
  })
})
