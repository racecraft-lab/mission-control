import { describe, expect, it } from 'vitest'
import { runCommand } from '@/lib/command'

describe('runCommand security boundaries', () => {
  it('rejects shell interpreter execution with inline command payloads', () => {
    expect(() => runCommand('sh', ['-c', 'echo safe; echo injected'])).toThrow(
      'Shell interpreter inline execution is not allowed'
    )
  })
})
