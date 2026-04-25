import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { resolveSafeMemoryPath } from '../memory-path'

let testDir: string | null = null

afterEach(async () => {
  if (testDir) {
    await rm(testDir, { recursive: true, force: true })
    testDir = null
  }
})

describe('resolveSafeMemoryPath', () => {
  it('rejects paths containing dot-dot segments', async () => {
    testDir = await mkdtemp(path.join(tmpdir(), 'memory-path-test-'))
    await mkdir(path.join(testDir, 'notes'), { recursive: true })

    await expect(resolveSafeMemoryPath(testDir, 'notes..md')).rejects.toThrow()
  })

  it('rejects absolute paths', async () => {
    testDir = await mkdtemp(path.join(tmpdir(), 'memory-path-test-'))

    await expect(resolveSafeMemoryPath(testDir, '/etc/passwd')).rejects.toThrow()
  })

  it('rejects NUL bytes', async () => {
    testDir = await mkdtemp(path.join(tmpdir(), 'memory-path-test-'))

    await expect(resolveSafeMemoryPath(testDir, 'notes\u0000.md')).rejects.toThrow()
  })
})
