import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

function source(path: string) {
  return readFileSync(path, 'utf8')
}

const unownedFacilityGlobalSurfaces = [
  'src/components/panels/skills-panel.tsx',
  'src/components/panels/session-details-panel.tsx',
  'src/components/chat/chat-panel.tsx',
  'src/components/panels/system-monitor-panel.tsx',
  'src/components/panels/audit-trail-panel.tsx',
] as const

describe('Facility/global boundary panels', () => {
  it('keeps skills, local/gateway sessions, transcripts, system monitor, and audit trail unowned by Product Line state', () => {
    for (const filePath of unownedFacilityGlobalSurfaces) {
      const content = source(filePath)
      expect(content, `${filePath} must not read selected Product Line state`).not.toContain('activeProductLineScope')
      expect(content, `${filePath} must not append selected Product Line scope`).not.toContain('appendScopeToPath')
      expect(content, `${filePath} must not set Product Line query params`).not.toMatch(/workspace_id|workspace_scope/)
    }
  })

  it('keeps notifications Facility aggregate even when a Product Line is selected', () => {
    const notifications = source('src/components/panels/notifications-panel.tsx')

    expect(notifications).toContain('createFacilityScope')
    expect(notifications).toContain('notificationScope')
    expect(notifications).toContain('appendScopeToPath(`/api/notifications?recipient=${encodeURIComponent(recipient)}`, notificationScope)')
    expect(notifications).toContain("appendScopeToPath('/api/notifications', notificationScope)")
    expect(notifications).not.toContain('appendScopeToPath(`/api/notifications?recipient=${encodeURIComponent(recipient)}`, activeProductLineScope)')
    expect(notifications).not.toContain("appendScopeToPath('/api/notifications', activeProductLineScope)")
  })
})
