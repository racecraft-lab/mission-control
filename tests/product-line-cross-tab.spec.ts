import { test, expect } from '@playwright/test'

test.describe('Product Line scope cross-tab browser contract', () => {
  test('same-origin tabs converge on newer scope messages and ignore duplicate versions', async ({ browser }) => {
    const context = await browser.newContext()
    const pageA = await context.newPage()
    const pageB = await context.newPage()

    await pageA.goto('/login')
    await pageB.goto('/login')

    await pageB.evaluate(() => {
      localStorage.setItem('mc:active-workspace:v1', JSON.stringify({
        payloadVersion: 1,
        tenantId: 7,
        productLineId: null,
        scopeVersion: 1,
      }))

      const channel = new BroadcastChannel('mc:active-workspace')
      channel.onmessage = (event) => {
        const current = JSON.parse(localStorage.getItem('mc:active-workspace:v1') || '{"scopeVersion":0}')
        const message = event.data
        if (message.tenantId !== 7) return
        if (message.scopeVersion <= current.scopeVersion) return
        localStorage.setItem('mc:active-workspace:v1', JSON.stringify({
          payloadVersion: 1,
          tenantId: message.tenantId,
          productLineId: message.productLineId,
          scopeVersion: message.scopeVersion,
        }))
      }
    })

    await pageA.evaluate(() => {
      const channel = new BroadcastChannel('mc:active-workspace')
      channel.postMessage({
        payloadVersion: 1,
        tenantId: 7,
        productLineId: 42,
        scopeVersion: 10,
        originTabId: 'tab-a',
      })
    })

    await expect.poll(async () => pageB.evaluate(() => localStorage.getItem('mc:active-workspace:v1'))).toContain('"productLineId":42')

    await pageA.evaluate(() => {
      const channel = new BroadcastChannel('mc:active-workspace')
      channel.postMessage({
        payloadVersion: 1,
        tenantId: 7,
        productLineId: null,
        scopeVersion: 10,
        originTabId: 'tab-a-duplicate',
      })
    })

    await expect.poll(async () => pageB.evaluate(() => localStorage.getItem('mc:active-workspace:v1'))).toContain('"productLineId":42')
    await context.close()
  })
})
