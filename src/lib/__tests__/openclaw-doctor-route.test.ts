import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireRole = vi.fn()
const runOpenClaw = vi.fn()
const prepare = vi.fn()
const archiveOrphanTranscriptsForStateDir = vi.fn()

vi.mock('@/lib/auth', () => ({
  requireRole,
}))

vi.mock('@/lib/command', () => ({
  runOpenClaw,
}))

vi.mock('@/lib/config', () => ({
  config: {
    openclawStateDir: '/tmp/openclaw-state',
  },
}))

vi.mock('@/lib/db', () => ({
  getDatabase: vi.fn(() => ({ prepare })),
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}))

vi.mock('@/lib/openclaw-doctor-fix', () => ({
  archiveOrphanTranscriptsForStateDir,
}))

describe('/api/openclaw/doctor', () => {
  beforeEach(() => {
    vi.resetModules()
    requireRole.mockReturnValue({ user: { username: 'admin' } })
    runOpenClaw.mockReset()
    archiveOrphanTranscriptsForStateDir.mockReset()
    archiveOrphanTranscriptsForStateDir.mockReturnValue({ archivedOrphans: 0, storesScanned: 1 })
    prepare.mockReset()
    prepare.mockReturnValue({ run: vi.fn() })
  })

  it('uses the extended timeout for doctor inspection', async () => {
    runOpenClaw.mockResolvedValueOnce({ stdout: 'OK: configuration valid', stderr: '', code: 0 })

    const { GET } = await import('@/app/api/openclaw/doctor/route')
    const response = await GET(new Request('http://localhost/api/openclaw/doctor'))

    expect(response.status).toBe(200)
    expect(runOpenClaw).toHaveBeenCalledWith(['doctor'], { timeoutMs: 60_000 })
  })

  it('reruns doctor with the extended timeout after applying fixes', async () => {
    runOpenClaw
      .mockResolvedValueOnce({ stdout: 'fixed', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: 'cleanup', stderr: '', code: 0 })
      .mockResolvedValueOnce({ stdout: 'OK: configuration valid', stderr: '', code: 0 })

    const { POST } = await import('@/app/api/openclaw/doctor/route')
    const response = await POST(new Request('http://localhost/api/openclaw/doctor', { method: 'POST' }))

    expect(response.status).toBe(200)
    expect(runOpenClaw).toHaveBeenNthCalledWith(1, ['doctor', '--fix', '--non-interactive', '--yes'], {
      timeoutMs: 120_000,
    })
    expect(runOpenClaw).toHaveBeenNthCalledWith(2, ['sessions', 'cleanup', '--all-agents', '--enforce', '--fix-missing'], {
      timeoutMs: 120_000,
    })
    expect(runOpenClaw).toHaveBeenNthCalledWith(3, ['doctor'], { timeoutMs: 60_000 })
  })
})
