import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('HeaderBar Facility terminology guard', () => {
  it('does not label tenant/facility context as Workspace', () => {
    const source = readFileSync('src/components/layout/header-bar.tsx', 'utf8')
    const tenantContextStart = source.indexOf('!workspaceSwitcherEnabled && activeTenant')
    const tenantContext = source.slice(tenantContextStart, source.indexOf('<ModeBadge', tenantContextStart))

    expect(tenantContextStart).toBeGreaterThan(-1)
    expect(tenantContext).not.toContain("th('workspace')")
    expect(tenantContext).not.toMatch(/Workspace/)
    expect(tenantContext).toContain("ts('facility')")
  })
})
