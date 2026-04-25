import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getEffectiveEnvValueMock } = vi.hoisted(() => ({
  getEffectiveEnvValueMock: vi.fn<
    (key: string) => Promise<string>
  >(),
}))

vi.mock('@/lib/runtime-env', () => ({
  getEffectiveEnvValue: getEffectiveEnvValueMock,
}))

import { GitHubUrlValidationError, githubFetch } from '@/lib/github'

describe('githubFetch URL validation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()

    getEffectiveEnvValueMock.mockImplementation(async (key: string) => {
      if (key === 'GITHUB_TOKEN') return 'test-token'
      if (key === 'GITHUB_API_BASE_URL') return ''
      return ''
    })
  })

  it('allows normal API paths under the GitHub API base', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(githubFetch('/repos/foo/bar/issues')).resolves.toBeInstanceOf(Response)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/foo/bar/issues',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    )
  })

  it('rejects protocol-relative escape paths', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(githubFetch('//evil.com/path')).rejects.toThrow(GitHubUrlValidationError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects absolute external URLs', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(githubFetch('https://evil.com/path')).rejects.toThrow(GitHubUrlValidationError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
