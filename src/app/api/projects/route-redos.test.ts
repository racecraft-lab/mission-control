import { describe, expect, it } from 'vitest'
import safeRegex from '../../../test/safe-regex'
import {
  slugify,
  SLUG_NON_ALNUM_SEQUENCE_RE,
  SLUG_LEADING_DASH_RE,
  SLUG_TRAILING_DASH_RE,
} from './route'

describe('projects route slugify redos guards', () => {
  it('preserves slugify behavior on valid input', () => {
    expect(slugify('My Cool Project')).toBe('my-cool-project')
    expect(slugify('___Hello---World___')).toBe('hello-world')
    expect(slugify('  already-slugged  ')).toBe('already-slugged')
  })

  it('marks rewritten slug regexes as safe', () => {
    expect(safeRegex(SLUG_NON_ALNUM_SEQUENCE_RE)).toBe(true)
    expect(safeRegex(SLUG_LEADING_DASH_RE)).toBe(true)
    expect(safeRegex(SLUG_TRAILING_DASH_RE)).toBe(true)
  })

  it('handles adversarial slug input quickly', () => {
    const input = `${'a'.repeat(20_000)}${'_'.repeat(20_000)}${'a'.repeat(20_000)}`
    const start = performance.now()
    slugify(input)
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(50)
  })
})
