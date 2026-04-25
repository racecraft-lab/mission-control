/**
 * Shared path safety helpers for memory filesystem routes.
 * Extracted from /api/memory/route.ts so all memory routes use the same
 * path traversal protection and prefix allowlist enforcement.
 */

import { lstat, realpath } from 'fs/promises'
import { lstatSync, realpathSync } from 'fs'
import { dirname, isAbsolute, resolve, sep } from 'path'
import { config } from '@/lib/config'

export const MEMORY_PATH = config.memoryDir
export const MEMORY_ALLOWED_PREFIXES = (config.memoryAllowedPrefixes || []).map((p) => p.replace(/\\/g, '/'))

const MEMORY_PATH_ERROR_MESSAGE = 'Invalid memory path'

export class MemoryPathError extends Error {
  readonly code = 'INVALID_MEMORY_PATH'

  constructor() {
    super(MEMORY_PATH_ERROR_MESSAGE)
    this.name = 'MemoryPathError'
  }
}

function memoryPathError(): MemoryPathError {
  return new MemoryPathError()
}

function isWithinBase(base: string, candidate: string): boolean {
  if (candidate === base) return true
  return candidate.startsWith(base + sep)
}

function assertUntrustedRelativePath(relativePath: string): string {
  const value = String(relativePath ?? '')

  if (value.includes('\u0000') || value.includes('..') || isAbsolute(value)) {
    throw memoryPathError()
  }

  return value
}

function resolveContainedPath(baseDir: string, relativePath: string): { baseResolved: string; fullPath: string } {
  const baseResolved = resolve(baseDir)
  const untrusted = assertUntrustedRelativePath(relativePath)
  const fullPath = resolve(baseResolved, untrusted)

  if (!isWithinBase(baseResolved, fullPath)) {
    throw memoryPathError()
  }

  return { baseResolved, fullPath }
}

async function findNearestExistingParentRealpath(candidatePath: string): Promise<string> {
  let current = dirname(candidatePath)

  while (true) {
    try {
      return await realpath(current)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') throw err
      const next = dirname(current)
      if (next === current) throw memoryPathError()
      current = next
    }
  }
}

function findNearestExistingParentRealpathSync(candidatePath: string): string {
  let current = dirname(candidatePath)

  while (true) {
    try {
      return realpathSync(current)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') throw err
      const next = dirname(current)
      if (next === current) throw memoryPathError()
      current = next
    }
  }
}

export function normalizeRelativePath(value: string): string {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '')
}

export function isPathAllowed(relativePath: string): boolean {
  if (!MEMORY_ALLOWED_PREFIXES.length) return true
  const normalized = normalizeRelativePath(relativePath)
  return MEMORY_ALLOWED_PREFIXES.some((prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix))
}

export async function resolveSafeMemoryPath(baseDir: string, relativePath: string): Promise<string> {
  const { fullPath } = resolveContainedPath(baseDir, relativePath)
  const baseReal = await realpath(baseDir)

  const parentReal = await findNearestExistingParentRealpath(fullPath)
  if (!isWithinBase(baseReal, parentReal)) {
    throw memoryPathError()
  }

  try {
    const st = await lstat(fullPath)
    if (st.isSymbolicLink()) {
      throw memoryPathError()
    }
    const fileReal = await realpath(fullPath)
    if (!isWithinBase(baseReal, fileReal)) {
      throw memoryPathError()
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      throw err
    }
  }

  return fullPath
}

export function resolveSafeMemoryPathSync(baseDir: string, relativePath: string): string {
  const { fullPath } = resolveContainedPath(baseDir, relativePath)
  const baseReal = realpathSync(baseDir)

  const parentReal = findNearestExistingParentRealpathSync(fullPath)
  if (!isWithinBase(baseReal, parentReal)) {
    throw memoryPathError()
  }

  try {
    const st = lstatSync(fullPath)
    if (st.isSymbolicLink()) {
      throw memoryPathError()
    }
    const fileReal = realpathSync(fullPath)
    if (!isWithinBase(baseReal, fileReal)) {
      throw memoryPathError()
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      throw err
    }
  }

  return fullPath
}
