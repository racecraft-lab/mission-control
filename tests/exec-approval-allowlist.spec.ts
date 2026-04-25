import { test, expect } from '@playwright/test'
import { API_KEY_HEADER } from './helpers'

test.describe('Exec Approval Allowlist API', () => {
  // ── GET /api/exec-approvals?action=allowlist ──

  test('GET allowlist returns agents map and hash', async ({ request }) => {
    const res = await request.get('/api/exec-approvals?action=allowlist', {
      headers: API_KEY_HEADER,
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('agents')
    expect(typeof body.agents).toBe('object')
    expect(body).toHaveProperty('hash')
    expect(typeof body.hash).toBe('string')
  })

  // ── PUT /api/exec-approvals (save allowlist) ──

  test('PUT save-allowlist persists and round-trips', async ({ request }) => {
    // Read current state to get hash
    const getRes = await request.get('/api/exec-approvals?action=allowlist', {
      headers: API_KEY_HEADER,
    })
    expect(getRes.status()).toBe(200)
    const current = await getRes.json()

    // Save with a test agent pattern
    const testAgent = `e2e-test-agent-${Date.now()}`
    const putRes = await request.put('/api/exec-approvals', {
      headers: API_KEY_HEADER,
      data: {
        agents: { [testAgent]: [{ pattern: 'echo *' }] },
        hash: current.hash,
      },
    })
    expect(putRes.status()).toBe(200)
    const putBody = await putRes.json()
    expect(putBody.ok).toBe(true)
    expect(putBody.hash).toBeDefined()

    // Read back and verify
    const verifyRes = await request.get('/api/exec-approvals?action=allowlist', {
      headers: API_KEY_HEADER,
    })
    expect(verifyRes.status()).toBe(200)
    const verifyBody = await verifyRes.json()
    expect(verifyBody.agents[testAgent]).toBeDefined()
    expect(verifyBody.agents[testAgent]).toEqual([{ pattern: 'echo *' }])

    // Clean up: remove the test agent by saving empty patterns
    await request.put('/api/exec-approvals', {
      headers: API_KEY_HEADER,
      data: {
        agents: { [testAgent]: [] },
        hash: verifyBody.hash,
      },
    })
  })

  test('PUT save-allowlist with stale hash returns 409', async ({ request }) => {
    const res = await request.put('/api/exec-approvals', {
      headers: API_KEY_HEADER,
      data: {
        agents: { 'conflict-agent': [{ pattern: 'test' }] },
        hash: 'stale-hash-value-that-does-not-match',
      },
    })
    // 409 if the file exists and hash mismatches; 200 if file doesn't exist (no conflict possible)
    if (res.status() === 409) {
      const body = await res.json()
      expect(body.code).toBe('CONFLICT')
    } else {
      // File didn't exist, so no conflict — clean up
      expect(res.status()).toBe(200)
      await res.json()
      // Re-read and clean up the test entry
      const getRes = await request.get('/api/exec-approvals?action=allowlist', {
        headers: API_KEY_HEADER,
      })
      const current = await getRes.json()
      await request.put('/api/exec-approvals', {
        headers: API_KEY_HEADER,
        data: {
          agents: { 'conflict-agent': [] },
          hash: current.hash,
        },
      })
    }
  })

  test('PUT save-allowlist rejects missing agents field', async ({ request }) => {
    const res = await request.put('/api/exec-approvals', {
      headers: API_KEY_HEADER,
      data: {},
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('agents')
  })

  // ── GET /api/exec-approvals (pending approvals) ──

  test('GET pending approvals returns array or empty on gateway unavailable', async ({ request }) => {
    const res = await request.get('/api/exec-approvals', { headers: API_KEY_HEADER })
    expect(res.status()).toBe(200)
    const body = await res.json()
    // Returns { approvals: [] } when gateway is unavailable
    expect(body).toHaveProperty('approvals')
    expect(Array.isArray(body.approvals)).toBe(true)
  })

  // ── Auth ──────────────────────────────────────

  test('GET without auth is rejected', async ({ request }) => {
    const res = await request.get('/api/exec-approvals?action=allowlist')
    expect(res.status()).toBe(401)
  })

  test('PUT without auth is rejected', async ({ request }) => {
    const res = await request.put('/api/exec-approvals', {
      data: { agents: {} },
    })
    expect(res.status()).toBe(401)
  })

  test('POST without auth is rejected', async ({ request }) => {
    const res = await request.post('/api/exec-approvals', {
      data: { id: 'test', action: 'approve' },
    })
    expect(res.status()).toBe(401)
  })
})
