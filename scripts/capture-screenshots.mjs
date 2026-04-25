#!/usr/bin/env node
// Capture README screenshots driven by docs/screenshot-manifest.json.
//
// Auth modes (first match wins):
//   1. MC_STORAGE_STATE   path to a Playwright storage state JSON (cookies + localStorage)
//   2. AUTH_USER + AUTH_PASS  → credentials are POSTed to /api/auth/login at startup
//   3. --auth=interactive  → opens chromium so a human can sign in once; saves storage state and exits
//
// Usage:
//   MC_URL=http://localhost:3000 AUTH_USER=admin AUTH_PASS=... node scripts/capture-screenshots.mjs
//   node scripts/capture-screenshots.mjs --only=security
//   node scripts/capture-screenshots.mjs --baseline   # writes to docs/_captures/ instead of docs/
//   node scripts/capture-screenshots.mjs --auth=interactive --storage=.mc-auth.json

import { chromium } from '@playwright/test'
import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')

const args = parseArgs(process.argv.slice(2))
const MC_URL = (process.env.MC_URL || 'http://localhost:3000').replace(/\/$/, '')

const manifestPath = resolve(REPO_ROOT, args.manifest || 'docs/screenshot-manifest.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

const onlyIds = args.only ? new Set(args.only.split(',')) : null
const targetPanels = manifest.panels.filter(p => !onlyIds || onlyIds.has(p.id))
if (!targetPanels.length) {
  console.error(`No panels matched --only=${args.only}. Available: ${manifest.panels.map(p => p.id).join(', ')}`)
  process.exit(2)
}

const outDirOverride = args.baseline ? 'docs/_captures' : null

const storagePath = process.env.MC_STORAGE_STATE || args.storage || null
const authMode = args.auth || (storagePath && existsSync(resolve(REPO_ROOT, storagePath))
  ? 'storage'
  : (process.env.AUTH_USER && process.env.AUTH_PASS) ? 'credentials' : 'none')

console.log(`[capture] MC_URL=${MC_URL}  panels=${targetPanels.map(p => p.id).join(',')}  authMode=${authMode}`)

const browser = await chromium.launch({
  headless: authMode !== 'interactive',
  args: ['--ignore-certificate-errors'],
})

try {
  if (authMode === 'interactive') {
    await runInteractiveLogin({ storagePath })
    process.exit(0)
  }

  const context = await browser.newContext({
    viewport: {
      width: manifest.viewport.width,
      height: manifest.viewport.height,
    },
    deviceScaleFactor: manifest.viewport.deviceScaleFactor || 1,
    ignoreHTTPSErrors: true,
    storageState: authMode === 'storage' ? resolve(REPO_ROOT, storagePath) : undefined,
  })

  if (authMode === 'credentials') {
    await loginWithCredentials(context)
  }

  // Long-poll / slow endpoints that aren't load-bearing for screenshots —
  // letting them block the network keeps `networkidle` busy for 30+ seconds
  // and the capture lands in a transitional render state. Use specific
  // path patterns (not a global **/*) so we don't accidentally short-circuit
  // any auth or content endpoint.
  await context.route('**/api/events**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ events: [] }),
  }))
  await context.route('**/api/openclaw/doctor**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ issues: [] }),
  }))

  // Dismiss the onboarding wizard once via its own UI so the layout is the
  // same one a returning user sees. Doing it via DOM click avoids any
  // assumption about which storage key gates the wizard.
  await dismissOnboardingOnce(context)

  for (const panel of targetPanels) {
    await capturePanel(context, panel)
  }

  await context.close()
  console.log(`[capture] done — ${targetPanels.length} panel(s)`)
} finally {
  await browser.close()
}

async function capturePanel(context, panel) {
  const page = await context.newPage()
  page.setDefaultTimeout(30_000)

  const url = `${MC_URL}${panel.url}`
  console.log(`[capture] ${panel.id} → ${url}`)

  await page.goto(url, { waitUntil: 'domcontentloaded' })
  // Wait until network settles OR ~6s elapses, whichever first.
  await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => null)
  // Then wait for the actual app shell to appear (sidebar nav).
  await page.waitForSelector('nav[aria-label="Main navigation"]', { timeout: 8000 }).catch(() => null)

  // Hide transient overlay banners + side panels per manifest before capture.
  await page.addStyleTag({
    content: (manifest.navigation.hideSelectors || [])
      .map(s => `${s} { display: none !important; }`).join('\n'),
  }).catch(() => {})

  // Heuristic: hide any element near the top whose textContent mentions OpenClaw
  // (covers banners that don't expose className).
  await page.evaluate(() => {
    const banners = Array.from(document.querySelectorAll('div')).filter(d => {
      const t = d.textContent || ''
      if (!/OpenClaw (state integrity|update|doctor)/i.test(t)) return false
      if (t.length > 800) return false
      const r = d.getBoundingClientRect()
      return r.top >= 0 && r.top < 260 && r.width > 400
    })
    banners.forEach(b => { b.style.display = 'none' })

    // Hide live-feed side panel if open.
    const liveFeed = Array.from(document.querySelectorAll('*')).find(el => {
      const t = el.textContent || ''
      if (!/^Live Feed/.test(t.trim().slice(0, 20))) return false
      const r = el.getBoundingClientRect()
      return r.right > window.innerWidth * 0.9 && r.width < 400 && r.height > 400
    })
    if (liveFeed) liveFeed.style.display = 'none'
  }).catch(() => {})

  if (panel.postNavigateAction) {
    await runPostNavigateAction(page, panel.postNavigateAction)
  }

  await page.waitForTimeout(manifest.navigation.settleMs || 1000)

  const targetPng = outDirOverride
    ? resolve(REPO_ROOT, outDirOverride, basename(panel.png))
    : resolve(REPO_ROOT, panel.png)
  await mkdir(dirname(targetPng), { recursive: true })
  await page.screenshot({ path: targetPng, fullPage: true, type: 'png' })

  console.log(`[capture]   wrote ${targetPng}`)
  await page.close()
}

async function runPostNavigateAction(page, action) {
  // Format: "click-tab:<label>" → finds a button/tab matching the label and clicks it.
  if (action.startsWith('click-tab:')) {
    const label = action.slice('click-tab:'.length)
    const clicked = await page.evaluate((label) => {
      const candidate = Array.from(document.querySelectorAll('button, [role="tab"], a'))
        .find(el => (el.textContent || '').trim().toLowerCase() === label.toLowerCase())
      if (candidate) { candidate.click(); return true }
      return false
    }, label)
    if (!clicked) console.warn(`[capture]   warning: tab "${label}" not found`)
    await page.waitForTimeout(800)
    return
  }
  console.warn(`[capture]   warning: unknown postNavigateAction: ${action}`)
}

async function dismissOnboardingOnce(context) {
  const page = await context.newPage()
  try {
    await page.goto(MC_URL, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => null)
    // Try every plausible dismissal: a "Skip setup" link/button, then storage flag.
    const dismissed = await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('button, a, [role="button"]'))
      const t = (el) => (el.textContent || '').trim().toLowerCase()
      const skip = candidates.find(el => /^skip(\s+setup)?$/.test(t(el)))
      if (skip) { skip.click(); return 'skip-clicked' }
      try { window.sessionStorage.setItem('mc-onboarding-dismissed', '1') } catch (_) {}
      try { window.localStorage.setItem('mc-onboarding-dismissed', '1') } catch (_) {}
      return 'storage-set'
    })
    console.log(`[capture] onboarding dismissal: ${dismissed}`)
    await page.waitForTimeout(800)
  } catch (e) {
    console.warn(`[capture] onboarding dismiss failed: ${e.message}`)
  } finally {
    await page.close()
  }
}

async function loginWithCredentials(context) {
  const user = process.env.AUTH_USER
  const pass = process.env.AUTH_PASS
  console.log(`[capture] logging in as ${user} via /api/auth/login`)
  const page = await context.newPage()
  const res = await page.request.post(`${MC_URL}/api/auth/login`, {
    data: { username: user, password: pass },
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok()) {
    throw new Error(`login failed: ${res.status()} ${await res.text()}`)
  }
  await page.close()
}

async function runInteractiveLogin({ storagePath }) {
  const target = storagePath || '.mc-auth.json'
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()
  await page.goto(MC_URL)
  console.log(`[capture] interactive: log in via the browser window. After you see the dashboard, close the window or press Ctrl+C — storage state is saved continuously.`)
  page.on('close', async () => {
    try {
      await context.storageState({ path: resolve(REPO_ROOT, target) })
      console.log(`[capture] storage state saved to ${target}`)
    } catch (e) {
      console.error(`[capture] failed to save storage state: ${e.message}`)
    }
  })
  await new Promise(resolve => page.on('close', resolve))
  await context.close()
}

function parseArgs(argv) {
  const out = {}
  for (const arg of argv) {
    const m = arg.match(/^--([a-z][a-z0-9-]*)(?:=(.*))?$/i)
    if (!m) continue
    out[m[1]] = m[2] === undefined ? true : m[2]
  }
  return out
}
