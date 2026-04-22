import { describe, expect, it } from 'vitest'
import {
  buildOpenClawMainSessionKey,
  getAgentOpenClawId,
  resolveAgentSessionKey,
} from '@/lib/openclaw-agent-session'

describe('openclaw-agent-session', () => {
  it('prefers configured openclawId when deriving the agent id', () => {
    expect(
      getAgentOpenClawId({
        name: 'Aegis Reviewer',
        config: JSON.stringify({ openclawId: 'aegis' }),
      }),
    ).toBe('aegis')
  })

  it('falls back to a normalized agent name when config is missing', () => {
    expect(getAgentOpenClawId({ name: 'Security Guardian' })).toBe('security-guardian')
  })

  it('builds the canonical OpenClaw main session key', () => {
    expect(buildOpenClawMainSessionKey('aegis')).toBe('agent:aegis:main')
  })

  it('returns the stored session_key when present', () => {
    expect(
      resolveAgentSessionKey({
        name: 'aegis',
        session_key: 'agent:aegis:main',
        config: JSON.stringify({ openclawId: 'aegis' }),
      }),
    ).toBe('agent:aegis:main')
  })

  it('derives a routable main session key when the DB field is empty', () => {
    expect(
      resolveAgentSessionKey({
        name: 'aegis',
        session_key: null,
        config: JSON.stringify({ openclawId: 'aegis' }),
      }),
    ).toBe('agent:aegis:main')
  })
})
