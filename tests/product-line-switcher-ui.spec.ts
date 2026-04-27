import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import {
  dismissOnboardingForE2E,
  loginAsE2EAdmin,
  seedProductLineE2EData,
  type ProductLineE2EFixture,
} from './helpers'

const SWITCHER_NAME = /change facility or product line scope/i
const LISTBOX_NAME = /facility and product line scopes/i

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function attachReviewScreenshot(page: Page, testInfo: TestInfo, name: string) {
  if (process.env.SPEC002_SCREENSHOTS !== '1') return
  const dir = process.env.SPEC002_SCREENSHOT_DIR || path.join(process.cwd(), 'test-results', 'spec-002-screenshots')
  const screenshotPath = path.join(dir, `${name.replace(/[^a-z0-9-]+/gi, '-')}.png`)
  await fs.mkdir(dir, { recursive: true })
  await page.screenshot({ path: screenshotPath, fullPage: true })
  await testInfo.attach(`spec-002-${name}`, {
    path: screenshotPath,
    contentType: 'image/png',
  })
}

async function prepareAuthenticatedPage(page: Page, request: Parameters<typeof loginAsE2EAdmin>[1]) {
  await page.context().addInitScript(() => {
    sessionStorage.setItem('mc-onboarding-dismissed', '1')
    sessionStorage.removeItem('mc-onboarding-replay')
  })
  const cookieHeader = await loginAsE2EAdmin(page, request)
  await dismissOnboardingForE2E(request, cookieHeader)
}

async function openSwitcher(page: Page) {
  const trigger = page.getByRole('button', { name: SWITCHER_NAME })
  await expect(trigger).toBeVisible()
  await trigger.click()
  const listbox = page.getByRole('listbox', { name: LISTBOX_NAME })
  await expect(listbox).toBeVisible()
  return { trigger, listbox }
}

async function expectControlInViewport(locator: Locator, width: number, label: string) {
  await expect(locator, label).toBeVisible()
  const box = await locator.boundingBox()
  expect(box, `${label} has a visible bounding box at ${width}px`).not.toBeNull()
  expect(box!.x, `${label} left edge at ${width}px`).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width, `${label} right edge at ${width}px`).toBeLessThanOrEqual(width)
}

test.describe.serial('SPEC-002 Product Line switcher real UI journey', () => {
  let fixture: ProductLineE2EFixture

  test.beforeAll(async ({ request }) => {
    fixture = await seedProductLineE2EData(request)
  })

  test.afterAll(async () => {
    await fixture?.cleanup()
  })

  test.beforeEach(async ({ page, request }) => {
    await prepareAuthenticatedPage(page, request)
  })

  test('switches Facility and Product Line scopes against seeded task data', async ({ page }, testInfo) => {
    await page.goto('/tasks')
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.getByRole('region', { name: /task board/i })).toBeVisible()
    await attachReviewScreenshot(page, testInfo, 'facility-task-board-before-switch')

    const { trigger, listbox } = await openSwitcher(page)
    await expect(listbox.getByRole('option', { name: /^Facility\b/i })).toHaveCount(1)
    await expect(listbox.getByRole('option', { name: new RegExp(escapeRegExp(fixture.alpha.workspace.name)) })).toBeVisible()
    await expect(listbox.getByRole('option', { name: new RegExp(escapeRegExp(fixture.beta.workspace.name)) })).toBeVisible()
    await attachReviewScreenshot(page, testInfo, 'scope-menu-options')

    await listbox.getByRole('option', { name: new RegExp(escapeRegExp(fixture.alpha.workspace.name)) }).click()
    await expect(trigger).toHaveAttribute('title', new RegExp(`Product Line: ${escapeRegExp(fixture.alpha.workspace.name)}`))
    await expect(page.getByRole('button', { name: new RegExp(escapeRegExp(fixture.alpha.taskTitle)) })).toBeVisible()
    await expect(page.getByRole('button', { name: new RegExp(escapeRegExp(fixture.beta.taskTitle)) })).toHaveCount(0)
    await attachReviewScreenshot(page, testInfo, 'alpha-scope-task-board')

    await trigger.click()
    await page.getByRole('listbox', { name: LISTBOX_NAME }).getByRole('option', { name: /^Facility\b/i }).click()
    await expect(trigger).toHaveAttribute('title', /^Facility: Facility$/)
    await expect(page.getByRole('button', { name: new RegExp(escapeRegExp(fixture.alpha.taskTitle)) })).toBeVisible()
    await expect(page.getByRole('button', { name: new RegExp(escapeRegExp(fixture.beta.taskTitle)) })).toBeVisible()
    await attachReviewScreenshot(page, testInfo, 'facility-aggregate-task-board-after-switch')
  })

  test('supports keyboard navigation and focus return on the real listbox', async ({ page }, testInfo) => {
    await page.goto('/tasks')
    const trigger = page.getByRole('button', { name: SWITCHER_NAME })
    await expect(trigger).toBeVisible()
    await trigger.focus()
    await page.keyboard.press('Enter')

    const listbox = page.getByRole('listbox', { name: LISTBOX_NAME })
    await expect(listbox).toBeVisible()
    await expect(listbox.getByRole('option', { name: /^Facility\b/i })).toBeFocused()
    await page.keyboard.press('End')
    await expect(listbox.getByRole('option').last()).toBeFocused()
    await page.keyboard.press('Home')
    await expect(listbox.getByRole('option', { name: /^Facility\b/i })).toBeFocused()
    await attachReviewScreenshot(page, testInfo, 'keyboard-listbox-focus')

    await page.keyboard.press('Escape')
    await expect(listbox).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })

  test('keeps the switcher and header controls usable on narrow mobile widths', async ({ page }, testInfo) => {
    for (const width of [320, 375, 390]) {
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/tasks')

      await expectControlInViewport(page.getByRole('button', { name: SWITCHER_NAME }), width, 'scope switcher')
      await expectControlInViewport(page.getByRole('button', { name: /jump to page|search/i }), width, 'mobile search')
      await expectControlInViewport(page.getByRole('button', { name: /go to notifications/i }), width, 'notifications')
      await expectControlInViewport(page.getByRole('button', { name: /language/i }), width, 'language')
      await expectControlInViewport(page.getByRole('button', { name: /change theme/i }), width, 'theme')

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(1)

      const { listbox } = await openSwitcher(page)
      await expect(listbox.getByRole('option', { name: /^Facility\b/i })).toBeVisible()
      await attachReviewScreenshot(page, testInfo, `mobile-${width}-scope-menu`)
      await page.keyboard.press('Escape')
    }
  })

  test('broadcasts selected Product Line scope to another real app tab', async ({ page }, testInfo) => {
    const pageB = await page.context().newPage()
    await page.goto('/tasks')
    await pageB.goto('/tasks')

    const triggerA = page.getByRole('button', { name: SWITCHER_NAME })
    const triggerB = pageB.getByRole('button', { name: SWITCHER_NAME })
    await expect(triggerA).toBeVisible()
    await expect(triggerB).toBeVisible()

    await triggerA.click()
    await page.getByRole('listbox', { name: LISTBOX_NAME })
      .getByRole('option', { name: new RegExp(escapeRegExp(fixture.alpha.workspace.name)) })
      .click()

    await expect(triggerA).toHaveAttribute('title', new RegExp(`Product Line: ${escapeRegExp(fixture.alpha.workspace.name)}`))
    await expect(triggerB).toHaveAttribute('title', new RegExp(`Product Line: ${escapeRegExp(fixture.alpha.workspace.name)}`), { timeout: 1000 })
    await attachReviewScreenshot(pageB, testInfo, 'cross-tab-alpha-scope')
    await pageB.close()
  })
})
