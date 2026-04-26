import { test, expect } from '@playwright/test'
import { API_KEY_HEADER } from './helpers'

test.describe('Workspace switcher flag-off regression', () => {
  const username = `workspace-flag-off-${Date.now()}`
  const password = 'testpass1234!'

  test.beforeAll(async ({ request }) => {
    const res = await request.post('/api/auth/users', {
      headers: API_KEY_HEADER,
      data: {
        username,
        password,
        display_name: 'Workspace Flag Off',
        role: 'admin',
      },
    })
    expect([201, 409]).toContain(res.status())
  })

  test('keeps legacy navigation and hides the Product Line switcher when the flag is off', async ({ page, request }) => {
    const tasksRes = await request.get('/api/tasks', { headers: API_KEY_HEADER })
    expect(tasksRes.status()).toBe(200)

    const loginRes = await request.post('/api/auth/login', {
      data: { username, password },
      headers: { 'x-real-ip': '10.88.42.222' },
    })
    expect(loginRes.status()).toBe(200)

    const setCookie = loginRes.headers()['set-cookie'] ?? ''
    const match = setCookie.match(/((?:__Host-)?mc-session)=([^;]+)/)
    expect(match).toBeTruthy()

    const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3005'
    await page.context().addCookies([{
      name: match?.[1] ?? 'mc-session',
      value: match?.[2] ?? '',
      domain: new URL(baseURL).hostname,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    }])

    await page.goto('/')
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.getByRole('button', { name: /change facility or product line scope/i })).toHaveCount(0)

    await page.goto('/tasks')
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.getByRole('button', { name: /change facility or product line scope/i })).toHaveCount(0)
  })
})
