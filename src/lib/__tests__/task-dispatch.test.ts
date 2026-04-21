import { describe, expect, it } from 'vitest'
import { resolveGatewayAgentIdForReviewAgent, resolveTaskDispatchModelOverride } from '@/lib/task-dispatch'

describe('resolveTaskDispatchModelOverride', () => {
  it('returns null when the agent has no explicit dispatch model override', () => {
    expect(resolveTaskDispatchModelOverride({ agent_config: null })).toBeNull()
    expect(resolveTaskDispatchModelOverride({ agent_config: '{"openclawId":"main"}' })).toBeNull()
  })

  it('returns the explicit dispatch model override when present', () => {
    expect(
      resolveTaskDispatchModelOverride({
        agent_config: '{"openclawId":"main","dispatchModel":"openai-codex/gpt-5.4"}',
      })
    ).toBe('openai-codex/gpt-5.4')
  })

  it('ignores malformed agent config payloads', () => {
    expect(resolveTaskDispatchModelOverride({ agent_config: '{not json' })).toBeNull()
  })
})

describe('resolveGatewayAgentIdForReviewAgent', () => {
  it('uses the dedicated Aegis openclawId when present', () => {
    expect(
      resolveGatewayAgentIdForReviewAgent({
        name: 'aegis',
        agent_config: '{"openclawId":"aegis"}',
      })
    ).toBe('aegis')
  })

  it('falls back to the Aegis record name when no openclawId is configured', () => {
    expect(
      resolveGatewayAgentIdForReviewAgent({
        name: 'aegis',
        agent_config: '{"dispatchModel":"openai-codex/gpt-5.4"}',
      })
    ).toBe('aegis')
  })

  it('ignores malformed reviewer config payloads and still falls back to aegis', () => {
    expect(
      resolveGatewayAgentIdForReviewAgent({
        name: 'aegis',
        agent_config: '{not json',
      })
    ).toBe('aegis')
  })
})
