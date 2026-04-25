#!/usr/bin/env node
// Diff captured screenshots (docs/_captures/*.png) against committed baselines (docs/*.png)
// using pixelmatch. Writes diff overlays to docs/_diffs/ and prints a JSON summary.
//
// Exits non-zero when any panel exceeds the manifest's diff.thresholdPixels.
//
// Usage:
//   node scripts/diff-screenshots.mjs
//   node scripts/diff-screenshots.mjs --captures=docs/_captures --output=docs/_diffs

import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')

const args = parseArgs(process.argv.slice(2))
const manifestPath = resolve(REPO_ROOT, args.manifest || 'docs/screenshot-manifest.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

const capturesDir = resolve(REPO_ROOT, args.captures || 'docs/_captures')
const diffsDir = resolve(REPO_ROOT, args.output || 'docs/_diffs')
await mkdir(diffsDir, { recursive: true })

const defaultThreshold = manifest.diff?.thresholdPixels ?? 2500
const perPixelDelta = manifest.diff?.perPixelDelta ?? 0.1
const panelThreshold = (panel) => panel.diff?.thresholdPixels ?? defaultThreshold

const results = []
for (const panel of manifest.panels) {
  const baselinePath = resolve(REPO_ROOT, panel.png)
  const candidatePath = resolve(capturesDir, basename(panel.png))
  const diffPath = resolve(diffsDir, basename(panel.png))

  if (!existsSync(candidatePath)) {
    results.push({ id: panel.id, status: 'missing-capture', panel: panel.png })
    continue
  }
  if (!existsSync(baselinePath)) {
    results.push({ id: panel.id, status: 'missing-baseline', panel: panel.png })
    continue
  }

  const baseline = PNG.sync.read(await readFile(baselinePath))
  const candidate = PNG.sync.read(await readFile(candidatePath))

  if (baseline.width !== candidate.width || baseline.height !== candidate.height) {
    results.push({
      id: panel.id,
      status: 'size-mismatch',
      panel: panel.png,
      baseline: { w: baseline.width, h: baseline.height },
      candidate: { w: candidate.width, h: candidate.height },
    })
    continue
  }

  const diff = new PNG({ width: baseline.width, height: baseline.height })
  const delta = pixelmatch(
    baseline.data, candidate.data, diff.data,
    baseline.width, baseline.height,
    { threshold: perPixelDelta, alpha: 0.4, diffColor: [255, 0, 0] }
  )

  if (delta > 0) {
    await writeFile(diffPath, PNG.sync.write(diff))
  }

  const panelLimit = panelThreshold(panel)
  results.push({
    id: panel.id,
    status: delta <= panelLimit ? 'pass' : 'fail',
    panel: panel.png,
    deltaPixels: delta,
    thresholdPixels: panelLimit,
    diffPath: delta > 0 ? `docs/_diffs/${basename(panel.png)}` : null,
  })
}

const failed = results.filter(r => r.status === 'fail' || r.status === 'size-mismatch')
const summary = {
  total: results.length,
  passed: results.filter(r => r.status === 'pass').length,
  failed: failed.length,
  missing: results.filter(r => r.status.startsWith('missing')).length,
  thresholdPixels: defaultThreshold,
  results,
}

console.log(JSON.stringify(summary, null, 2))

const summaryPath = resolve(REPO_ROOT, 'docs/_diffs/summary.json')
await writeFile(summaryPath, JSON.stringify(summary, null, 2))

process.exit(failed.length > 0 ? 1 : 0)

function parseArgs(argv) {
  const out = {}
  for (const arg of argv) {
    const m = arg.match(/^--([a-z][a-z0-9-]*)(?:=(.*))?$/i)
    if (!m) continue
    out[m[1]] = m[2] === undefined ? true : m[2]
  }
  return out
}
